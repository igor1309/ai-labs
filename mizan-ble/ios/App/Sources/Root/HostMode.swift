import Foundation
import AmountEntry
import HostBroadcast
import HostPayment
import HostUI
import Settings
import TimeoutNotice
import SettingsUI
import IMRxObservation
import Observation

@MainActor @Observable final class HostMode {
    private(set) var amount: ObservableModel<AmountEntry.State, AmountEntry.Event, Never>?
    private(set) var broadcast: ObservableModel<HostBroadcast.State, HostBroadcast.Event, HostBroadcast.Effect>?
    private(set) var payment: ObservableModel<HostPayment.State, HostPayment.Event, HostPayment.Effect>?
    private(set) var notice: ObservableModel<TimeoutNotice.State, TimeoutNotice.Event, TimeoutNotice.Effect>?
    var settingsPresented = false
    private var countdownSeconds: Int
    private let settings: Settings
    private let bindings: HostBindings
    private let noticeTimer: NoticeTimer
    private let radio: any HostRadioPort
    private let log: any LogSink
    private let restChanged: () -> Void
    private var pendingPaymentEvents: [HostBroadcast.Attempt: [HostPayment.Event]] = [:]

    var screen: HostState {
        HostMapping.screen(amount: amount?.state ?? .init(bluetooth: .unavailable(reason: "Bluetooth unavailable")),
                           broadcast: broadcast?.state ?? .init(), notice: notice?.state ?? .init(), payment: payment?.state,
                           name: settings.advertisedName, seconds: countdownSeconds)
    }
    var settingsScreen: SettingsState { HostMapping.settings(name: settings.advertisedName, seconds: countdownSeconds) }
    var isAtRest: Bool { HostMapping.atRest(broadcast?.state ?? .init(), payment?.state) }

    init(radio: any HostRadioPort, clock: any ClockPort, settings: Settings, bluetooth: HostBluetoothState,
         log: any LogSink, restChanged: @escaping () -> Void) {
        self.radio = radio
        self.settings = settings
        self.log = log
        self.restChanged = restChanged
        countdownSeconds = settings.countdown
        bindings = HostBindings(radio: radio, clock: clock, settings: settings, log: log)
        noticeTimer = NoticeTimer(clock: clock)
        let entry = AmountEntry.State(bluetooth: bluetooth.amountAvailability)
        amount = .init(initialState: entry,
                       reduce: loggedReducer(AmountEntry.reduce, initial: entry, category: .amountEntry, log: log,
                                             changed: { _, _ in }),
                       handleEffect: { _ in AsyncStream { $0.finish() } })
        let hidden = TimeoutNotice.State()
        notice = .init(initialState: hidden,
                       reduce: loggedReducer(TimeoutNotice.reduce, initial: hidden, category: .timeoutNotice, log: log,
                                             changed: { _, _ in }),
                       handleEffect: TimeoutNotice.EffectHandler(timer: noticeTimer).handle)
        noticeTimer.send = { [weak self] event in self?.notice?.event(event) }
        let initial = HostBroadcast.State()
        let handler = HostBroadcast.Handler(session: bindings, advertiser: bindings, sender: bindings, countdown: bindings, setting: bindings)
        broadcast = .init(initialState: initial,
                          reduce: loggedReducer(HostBroadcast.reduce, initial: initial, category: .hostBroadcast, log: log,
                                                changed: { [weak self] previous, next in
            // Queued now, so an action the operator takes on the timed-out screen comes after it.
            if next.phase == .timedOut, previous.phase != .timedOut, let attempt = previous.attempt {
                self?.notice?.event(.timedOut(.init(number: attempt.number)))
            }
            // A queued actor job runs after the reduction has invoked its effect handler.
            Task { @MainActor [weak self] in self?.broadcastChanged(from: previous, to: next) }
        }), handleEffect: handler.handle)
        bindings.send = { [weak self] event in self?.broadcast?.event(event) }
    }

    func event(_ event: HostEvent) {
        notice?.event(.acted)
        guard let amount, let broadcast,
              let input = HostMapping.event(event, amount: amount.state, payment: payment != nil) else { return }
        switch input {
        case .amount(let event):
            guard payment == nil, broadcast.state.phase == .ready || broadcast.state.phase == .timedOut else { return }
            amount.event(event)
        case .broadcast(let event): broadcast.event(event)
        case .payment(let event): payment?.event(event)
        case .settings:
            if isAtRest { settingsPresented = true }
        }
    }

    func event(_ event: SettingsEvent) {
        switch HostMapping.event(event) {
        case .countdown(let seconds):
            guard settingsPresented, isAtRest else { return }
            settings.chooseCountdown(seconds)
            countdownSeconds = settings.countdown
        case .dismiss: settingsPresented = false
        }
    }

    func receive(_ event: HostRadioEvent) {
        switch event {
        case .bluetoothState(let bluetooth):
            amount?.event(.bluetoothChanged(bluetooth.amountAvailability))
            if bluetooth != .poweredOn {
                if let payment { payment.event(.linkLost) }
                else if let attempt = broadcast?.state.attempt {
                    broadcast?.event(.bluetoothUnavailable(attempt, reason: bluetooth.screenReason))
                    if let session = bindings.session(for: attempt) { buffer(.linkLost, for: session.radioID) }
                }
            }
        case .onAir(let id):
            if let attempt = bindings.attempt(for: id) { broadcast?.event(.onAir(attempt)) }
        case .couldNotGoOnAir(let id, _):
            if let attempt = bindings.attempt(for: id) {
                broadcast?.event(.couldNotGoOnAir(attempt, reason: "Could not go on air"))
            }
        case .clientKey(let id, _, let bytes):
            if let attempt = bindings.attempt(for: id) {
                broadcast?.event(.clientKey(attempt, .init(id: id.uuidString), key: bytes))
            }
        case .decision(let id, let bytes):
            if ownsPayment(id) { payment?.event(.message(bytes)) }
            else { buffer(.message(bytes), for: id) }
        case .clientLost(let id):
            if ownsPayment(id) { payment?.event(.linkLost) }
            else if let attempt = bindings.attempt(for: id) {
                broadcast?.event(.linkLost(attempt, .init(id: id.uuidString)))
                buffer(.linkLost, for: id)
            }
        }
    }

    private func buffer(_ event: HostPayment.Event, for id: UUID) {
        guard let attempt = bindings.attempt(for: id), let state = broadcast?.state else { return }
        switch state.phase {
        case .handshake(.sendingAmount), .handedOver:
            // Radio acceptance can precede its queued result and the deferred hand-over.
            pendingPaymentEvents[attempt, default: []].append(event)
        default: break
        }
    }

    private func ownsPayment(_ id: UUID) -> Bool {
        guard payment != nil, case .handedOver(let secure) = broadcast?.state.phase else { return false }
        return bindings.session(for: secure.attempt)?.radioID == id
    }

    private func broadcastChanged(from previous: HostBroadcast.State, to next: HostBroadcast.State) {
        guard broadcast != nil else { return }
        if case .handedOver(let secure) = next.phase, payment == nil,
           let session = bindings.session(for: secure.attempt) {
            let transport = PaymentRadio(radio: radio, id: session.radioID, log: log)
            let handler = HostPayment.EffectHandler(session: session, sender: transport, link: transport)
            let initial = HostPayment.State(amount: secure.amount)
            payment = .init(initialState: initial,
                            reduce: loggedReducer(HostPayment.reduce, initial: initial, category: .hostPayment, log: log,
                                                  changed: { [weak self] _, state in
                Task { @MainActor [weak self] in self?.paymentChanged(state, attempt: secure.attempt) }
            }), handleEffect: handler.handle)
            for event in pendingPaymentEvents.removeValue(forKey: secure.attempt) ?? [] { payment?.event(event) }
        }
        if let attempt = previous.attempt, next.attempt != attempt { pendingPaymentEvents.removeValue(forKey: attempt) }
        if next.phase == .timedOut || (next.phase == .ready && previous.phase != .ready && next.amount.isEmpty) {
            amount?.event(.clear)
        }
        restChanged()
    }

    private func paymentChanged(_ state: HostPayment.State, attempt: HostBroadcast.Attempt) {
        guard payment != nil else { return }
        if state.isOver {
            broadcast?.event(.transactionEnded(attempt))
            payment = nil
            bindings.close(attempt)
        }
        restChanged()
    }

    func stop() {
        amount = nil
        broadcast = nil
        payment = nil
        notice = nil
        bindings.stop()
        noticeTimer.stop()
        pendingPaymentEvents.removeAll()
        settingsPresented = false
    }
}

extension HostBluetoothState {
    var screenReason: String {
        switch self {
        case .poweredOn: "Bluetooth available"
        case .poweredOff: "Bluetooth off"
        case .unauthorized: "Bluetooth not allowed"
        case .unsupported: "Bluetooth unsupported"
        case .unknown, .resetting: "Bluetooth unavailable"
        }
    }
    var amountAvailability: AmountEntry.Bluetooth {
        self == .poweredOn ? .available : .unavailable(reason: screenReason)
    }
}
