import Foundation
import ClientFind
import ClientConnect
import ClientReview
import ClientPayment
import ClientUI
import ClientPaymentUI
import MessageCodec
import Settings
import IMRxObservation
import Observation

@MainActor @Observable final class ClientMode {
    private(set) var find: ObservableModel<ClientFind.State, ClientFind.Event, ClientFind.Effect>?
    private(set) var connect: ObservableModel<ClientConnect.State, ClientConnect.Event, ClientConnect.Effect>?
    private(set) var review: ObservableModel<ClientReview.State, ClientReview.Event, ClientReview.Effect>?
    private(set) var payment: ObservableModel<ClientPayment.State, ClientPayment.Event, ClientPayment.Effect>?
    private var transport: ClientTransport?
    private let discovery: ClientDiscovery
    private let radio: any ClientRadioPort
    private let clock: any ClockPort
    private let log: any LogSink
    private let restChanged: () -> Void
    private enum Incoming { case message([UInt8]), drop }
    private var pendingReview: [Incoming] = []
    private var pendingPayment: [Incoming] = []

    var screen: ClientState { ClientMapping.screen(find: find?.state ?? .init(), connect: connect?.state, lines: lines) }
    private let lines: ClientMapping.SignalLines
    var paymentScreen: ClientPaymentState? {
        if let review { return ClientMapping.screen(review: review.state, payment: payment?.state) }
        if let payment {
            return ClientMapping.screen(review: .init(host: .init(id: "", name: payment.state.hostName), amount: payment.state.amountMinorUnits), payment: payment.state)
        }
        return nil
    }
    var isAtRest: Bool {
        ClientMapping.atRest(find: find?.state ?? .init(), connect: connect?.state, review: review?.state, payment: payment?.state)
    }

    init(radio: any ClientRadioPort, clock: any ClockPort, settings: Settings, bluetooth: ClientBluetoothState,
         log: any LogSink, restChanged: @escaping () -> Void) {
        self.radio = radio
        self.clock = clock
        self.log = log
        self.restChanged = restChanged
        lines = .init(floor: settings.pickerFloor, dropGap: settings.pickerDropGap)
        discovery = ClientDiscovery(radio: radio, clock: clock, settings: settings, log: log)
        let initial = ClientFind.State()
        let handler = ClientFind.EffectHandler(scanner: discovery)
        find = .init(initialState: initial,
                     reduce: loggedReducer(ClientFind.reduce, initial: initial, category: .clientFind, log: log,
                                           changed: { [weak self] _, state in
            Task { @MainActor [weak self] in self?.findChanged(state) }
        }), handleEffect: handler.handle)
        discovery.send = { [weak self] in self?.find?.event($0) }
        find?.event(.bluetoothChanged(bluetooth.findAvailability))
    }

    func event(_ event: ClientEvent) {
        switch ClientMapping.event(event) {
        case .find(let event): find?.event(event)
        case .cancel: connect?.event(.cancel)
        case .retry: connect?.event(.retry)
        }
    }
    func event(_ event: ClientPaymentEvent) {
        switch ClientMapping.event(event, payment: payment != nil) {
        case .review(let event): review?.event(event)
        case .payment(let event): payment?.event(event)
        }
    }
    func receive(_ event: ClientRadioEvent) {
        switch event {
        case .bluetooth(let bluetooth):
            find?.event(.bluetoothChanged(bluetooth.findAvailability))
            if bluetooth != .on { incoming(.drop) }
        case .reading(let id, let name, let rssi, let time): discovery.reading(host: id, name: name, rssi: rssi, time: time)
        case .connected(let host, let bytes, let largestWrite):
            guard transport?.id == host else { return }
            if let session = try? MessageCodec.decodeSession(bytes) {
                connect?.event(.connectionResult(.success(.init(session: .init(publicKey: session.publicKey, id: session.sessionID), largestWrite: largestWrite))))
            } else { connect?.event(.connectionResult(.failure(.sessionDisagreement))) }
        case .couldNotConnect(let host, _):
            if transport?.id == host { connect?.event(.connectionResult(.failure(.connection("Could not connect")))) }
        case .writeAnswered(.key, let failure):
            connect?.event(.keyWriteResult(failure == nil ? .success(()) : .failure(.keyRefused("Key refused"))))
        case .writeAnswered(.message, _): break // The sender's async answer belongs to the review handler.
        case .message(let host, let bytes):
            if transport?.id == host { incoming(.message(bytes)) }
        case .dropped(let host):
            if transport?.id == host { incoming(.drop) }
        }
    }

    private func incoming(_ event: Incoming) {
        guard transport != nil else { return }
        if let payment {
            switch event {
            case .message(let bytes): payment.event(.message(bytes))
            case .drop: payment.event(.linkDropped)
            }
        } else if let review {
            // Result frames belong to payment even when they arrive beside the acknowledgement.
            if review.state.phase == .handedOver || isResult(event) { pendingPayment.append(event); return }
            switch event {
            case .message(let bytes): review.event(.message(bytes))
            case .drop: review.event(.linkLost)
            }
        } else if let connect {
            switch connect.state.phase {
            case .connecting(.stoppingDeadline), .handedOver:
                pendingReview.append(event)
            default:
                switch event {
                case .drop: connect.event(.linkDropped)
                case .message(let bytes):
                    guard let frame = try? MessageCodec.decodeFrame(bytes), frame.kind == .amount else { return }
                    connect.event(.amountReceived(.init(counter: frame.counter, box: frame.sealedBox)))
                }
            }
        }
    }
    private func isResult(_ event: Incoming) -> Bool {
        if case .message(let bytes) = event { return (try? MessageCodec.decodeFrame(bytes).kind) == .result }
        return false
    }

    private func findChanged(_ state: ClientFind.State) {
        guard find != nil else { return }
        if case .handedOver(let host) = state.phase, transport == nil, let id = UUID(uuidString: host.id) {
            let transport = ClientTransport(id: id, radio: radio, clock: clock, log: log)
            self.transport = transport
            let initial = ClientConnect.State(host: .init(id: host.id, name: host.name))
            let handler = ClientConnect.Handler(link: transport, session: transport.session, deadline: transport)
            connect = .init(initialState: initial,
                            reduce: loggedReducer(ClientConnect.reduce, initial: initial, category: .clientConnect, log: log,
                                                  changed: { [weak self, weak transport] _, state in
                Task { @MainActor [weak self, weak transport] in
                    guard let transport, self?.transport === transport else { return }
                    self?.connectChanged(state, transport: transport)
                }
            }), handleEffect: handler.handle)
            transport.send = { [weak self, weak transport] event in
                guard let transport, self?.transport === transport else { return }
                self?.connect?.event(event)
            }
            connect?.event(.start)
        }
        restChanged()
    }
    private func connectChanged(_ state: ClientConnect.State, transport: ClientTransport) {
        guard connect != nil else { return }
        switch state.phase {
        case .handedOver(let secure):
            let initial = ClientReview.State(host: .init(id: state.host.id, name: state.host.name), amount: secure.amount.minorUnits)
            let handler = ClientReview.EffectHandler(session: transport.session, sender: transport, link: transport)
            review = .init(initialState: initial,
                           reduce: loggedReducer(ClientReview.reduce, initial: initial, category: .clientReview, log: log,
                                                 changed: { [weak self, weak transport] _, state in
                Task { @MainActor [weak self, weak transport] in
                    guard let transport, self?.transport === transport else { return }
                    self?.reviewChanged(state, transport: transport)
                }
            }), handleEffect: handler.handle)
            connect = nil
            let pending = pendingReview
            pendingReview.removeAll()
            for event in pending { incoming(event) }
        case .over: endTransaction()
        default: break
        }
        restChanged()
    }
    private func reviewChanged(_ state: ClientReview.State, transport: ClientTransport) {
        guard review != nil else { return }
        switch state.phase {
        case .handedOver:
            let initial = ClientPayment.State(hostName: state.host.name, amountMinorUnits: state.amount)
            let handler = ClientPayment.EffectHandler(session: transport.session, link: transport)
            payment = .init(initialState: initial,
                            reduce: loggedReducer(ClientPayment.reduce, initial: initial, category: .clientPayment, log: log,
                                                  changed: { [weak self, weak transport] _, state in
                Task { @MainActor [weak self, weak transport] in
                    guard let transport, self?.transport === transport else { return }
                    if state.status == .over { self?.endTransaction() }
                    self?.restChanged()
                }
            }), handleEffect: handler.handle)
            review = nil
            let pending = pendingPayment
            pendingPayment.removeAll()
            for event in pending { incoming(event) }
        case .over: endTransaction()
        default: break
        }
        restChanged()
    }
    private func endTransaction() {
        connect = nil
        review = nil
        payment = nil
        transport?.finish()
        transport = nil
        pendingReview.removeAll()
        pendingPayment.removeAll()
        find?.event(.transactionEnded)
    }
    func stop() {
        find = nil
        connect = nil
        review = nil
        payment = nil
        discovery.stop()
        transport?.finish()
        transport = nil
        pendingReview.removeAll()
        pendingPayment.removeAll()
    }
}

extension ClientBluetoothState {
    var findAvailability: ClientFind.Bluetooth {
        switch self {
        case .on: .available
        case .unknown, .resetting: .unknown
        case .off: .unavailable(reason: BluetoothReason.off.rawValue)
        case .notAllowed: .unavailable(reason: BluetoothReason.notAllowed.rawValue)
        case .unsupported: .unavailable(reason: BluetoothReason.unsupported.rawValue)
        }
    }
}
