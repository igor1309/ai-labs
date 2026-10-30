import Foundation
import ClientFind
import HostPicker
import HostChoice
import ClientConnect
import ClientReview
import ClientPayment
import SessionCrypto
import MessageCodec
import Settings

@MainActor final class ClientDiscovery: ClientFind.Scanner {
    private let radio: any ClientRadioPort
    private let clock: any ClockPort
    private let settings: Settings
    private let log: any LogSink
    private var picker: HostPicker<UUID>
    private var choice: HostChoice<UUID>
    private var lastPickerLine: (answer: HostChoice<UUID>.Answer, rssi: Int?, time: Double)?
    private var lastSignal: Int??
    private var hosts: [UUID: ClientFind.Host] = [:]
    private var ticks: Task<Void, Never>?
    private(set) var isScanning = false
    var send: (ClientFind.Event) -> Void = { _ in }

    init(radio: any ClientRadioPort, clock: any ClockPort, settings: Settings, log: any LogSink) {
        self.radio = radio
        self.clock = clock
        self.settings = settings
        self.log = log
        picker = Self.picker(settings)
        choice = HostChoice(hold: settings.choiceHold)
    }
    deinit { ticks?.cancel() }
    private static func picker(_ settings: Settings) -> HostPicker<UUID> {
        .init(alpha: settings.pickerAlpha, windowSeconds: settings.pickerWindowSeconds,
              windowReadings: settings.pickerWindowReadings, floor: settings.pickerFloor,
              margin: settings.pickerMargin, fade: settings.pickerFade,
              dropGap: settings.pickerDropGap)
    }
    func start() {
        guard !isScanning else { return }
        picker = Self.picker(settings)
        choice = HostChoice(hold: settings.choiceHold)
        hosts.removeAll()
        lastPickerLine = nil
        lastSignal = nil
        isScanning = true
        logPicker(.none, at: clock.now())
        radio.startScanning()
        let source = clock.ticks(every: .milliseconds(100))
        ticks = Task.immediate { [weak self] in
            for await time in source {
                guard !Task.isCancelled, let self else { return }
                self.answer(self.picker.answer(at: time), at: time)
            }
        }
    }
    func stop() {
        guard isScanning else { return }
        isScanning = false
        ticks?.cancel()
        ticks = nil
        hosts.removeAll()
        radio.stopScanning()
    }
    func reading(host: UUID, name: String?, rssi: Int, time: Double) {
        guard isScanning else { return }
        hosts[host] = .init(id: host.uuidString, name: name ?? hosts[host]?.name)
        answer(picker.receive(host: host, rssi: rssi, at: time), at: time)
    }
    private func answer(_ signal: HostPicker<UUID>.Answer, at time: Double) {
        guard isScanning else { return }
        let answer = choice.receive(Self.signal(signal), at: signal.time)
        logPicker(answer, at: time)
        let strongest = picker.view(at: time).strongestAverage.map { Int($0.rounded()) }
        if lastSignal != .some(strongest) {
            lastSignal = .some(strongest)
            send(.signalRead(strongest))
        }
        switch answer {
        case .none: send(.pickerAnswered(.none))
        case .holdCloser: send(.pickerAnswered(.holdCloser))
        case .host(let id):
            if let host = hosts[id] { send(.pickerAnswered(.host(host))) }
        }
    }

    private static func signal(_ answer: HostPicker<UUID>.Answer) -> HostChoice<UUID>.Signal {
        guard let leader = answer.leader else { return answer.hostHeard ? .noLeader : .noHost }
        switch leader.band {
        case .aboveFloor: return .leader(leader.host, .aboveFloor)
        case .betweenLines: return .leader(leader.host, .betweenLines)
        case .belowDrop(let since): return .leader(leader.host, .belowDrop(since: since))
        }
    }

    private func logPicker(_ answer: HostChoice<UUID>.Answer, at time: Double) {
        let view = picker.view(at: time)
        let rssi = view.strongestAverage.map { Int($0.rounded()) }
        let signalMoved: Bool
        if let previous = lastPickerLine, let previousRSSI = previous.rssi, let rssi {
            signalMoved = abs(rssi - previousRSSI) >= 3 && time - previous.time >= 1
        } else {
            signalMoved = false
        }
        guard lastPickerLine?.answer != answer || signalMoved else { return }
        let name: String = switch answer {
        case .none: "none"
        case .holdCloser: "holdCloser"
        case .host: "host"
        }
        lastPickerLine = (answer, rssi, time)
        let signal = rssi.map { " rssi=\($0)" } ?? ""
        log.write(.init(category: .clientFind, message: "picker \(name)\(signal) hosts=\(view.candidateCount)"))
    }
}

@MainActor final class ClientSession: ClientConnect.Session, ClientReview.Session, ClientPayment.Session {
    private var crypto: SessionCrypto?
    private let log: any LogSink
    init(log: any LogSink) { self.log = log }

    func derive(with host: ClientConnect.HostSession) -> Result<[UInt8], ClientConnect.Failure> {
        do {
            let session = try SessionCrypto(sessionID: host.id)
            try session.derive(peerPublicKey: host.publicKey)
            crypto = session
            return .success(session.publicKey)
        } catch { return .failure(.sessionDisagreement) }
    }
    func open(_ amount: ClientConnect.SealedAmount) -> Result<ClientConnect.Amount, ClientConnect.Failure> {
        do {
            let bytes = try MessageCodec.encodeFrame(.init(kind: .amount, counter: amount.counter, sealedBox: amount.box))
            guard case .amount(let units) = try decode(bytes, category: .clientConnect) else { return .failure(.unreadableAmount) }
            return .success(.init(minorUnits: units))
        } catch { return .failure(.unreadableAmount) }
    }
    func seal(_ decision: ClientReview.Decision) -> [UInt8] {
        do {
            guard let crypto else { return [] }
            let message = MessageCodec.Message.decision(decision == .confirm ? .confirm : .decline)
            let sealed = try crypto.seal(MessageCodec.encodeBody(message), kind: MessageCodec.Kind.decision.rawValue)
            return try MessageCodec.encodeFrame(.init(kind: .decision, counter: sealed.counter, sealedBox: sealed.sealedBox))
        } catch { return [] }
    }
    func open(_ bytes: [UInt8]) -> ClientReview.Message? {
        guard let message = try? decode(bytes, category: .clientReview) else { return nil }
        switch message {
        case .acknowledgement(.decision): return .decisionAcknowledged
        case .end: return .end
        default: return .unrelated
        }
    }
    func open(_ bytes: [UInt8]) -> ClientPayment.Outcome? {
        guard let message = try? decode(bytes, category: .clientPayment), case .result(let outcome) = message else { return nil }
        return outcome == .success ? .success : .failure
    }
    private func decode(_ bytes: [UInt8], category: LogEntry.Category) throws -> MessageCodec.Message {
        guard let crypto else { throw SessionCrypto.SessionError.closed }
        let frame = try MessageCodec.decodeFrame(bytes)
        let body = try crypto.open(.init(counter: frame.counter, sealedBox: frame.sealedBox), kind: frame.kind.rawValue)
        logMessage(bytes, direction: "opened", category: category, log: log)
        return try MessageCodec.decodeBody(body, kind: frame.kind)
    }
    func close() { crypto?.close() }
}

@MainActor final class ClientTransport: ClientConnect.Link, ClientConnect.Deadline, ClientReview.Sender, ClientReview.Link, ClientPayment.Link {
    let id: UUID
    let session: ClientSession
    private let radio: any ClientRadioPort
    private let clock: any ClockPort
    private let log: any LogSink
    private var deadline: Task<Void, Never>?
    private var linkStarted = false
    var send: (ClientConnect.Event) -> Void = { _ in }

    init(id: UUID, radio: any ClientRadioPort, clock: any ClockPort, log: any LogSink) {
        self.id = id
        self.radio = radio
        self.clock = clock
        self.log = log
        session = ClientSession(log: log)
    }
    deinit { deadline?.cancel() }
    func connect(to host: ClientConnect.Host) {
        linkStarted = true
        radio.connect(to: id)
    }
    func writeKey(_ key: [UInt8]) { radio.writeKey(key) }
    func write(_ bytes: [UInt8]) async -> ClientReview.WriteResult {
        let result = await radio.write(bytes)
        switch result {
        case .success:
            logMessage(bytes, direction: "sent", category: .clientReview, log: log)
            return .accepted
        case .failure: return .refused
        }
    }
    func drop() {
        guard linkStarted else { return }
        linkStarted = false
        radio.drop()
    }
    func start(seconds: Int) {
        stop()
        let source = clock.countdown(from: seconds, every: .seconds(1))
        let send = send
        deadline = Task.immediate {
            for await remaining in source {
                guard !Task.isCancelled else { return }
                if remaining == 0 { send(.deadlineExpired); return }
            }
        }
    }
    func stop() { deadline?.cancel(); deadline = nil }
    func finish() { stop(); session.close(); drop() }
}
