import Foundation
import ClientFind
import HostPicker
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
    private var lastPickerLine: (answer: HostPicker<UUID>.Answer, rssi: Int?)?
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
    }
    deinit { ticks?.cancel() }
    private static func picker(_ settings: Settings) -> HostPicker<UUID> {
        .init(alpha: settings.pickerAlpha, windowSeconds: settings.pickerWindowSeconds,
              windowReadings: settings.pickerWindowReadings, floor: settings.pickerFloor,
              margin: settings.pickerMargin, fade: settings.pickerFade)
    }
    func start() {
        guard !isScanning else { return }
        picker = Self.picker(settings)
        hosts.removeAll()
        lastPickerLine = nil
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
    private func answer(_ answer: HostPicker<UUID>.Answer, at time: Double) {
        guard isScanning else { return }
        logPicker(answer, at: time)
        switch answer {
        case .none: send(.pickerAnswered(.none))
        case .holdCloser: send(.pickerAnswered(.holdCloser))
        case .host(let id):
            if let host = hosts[id] { send(.pickerAnswered(.host(host))) }
        }
    }

    private func logPicker(_ answer: HostPicker<UUID>.Answer, at time: Double) {
        let view = picker.view(at: time)
        let rssi = view.leaderAverage.map { Int($0.rounded()) }
        let signalMoved: Bool
        if let previous = lastPickerLine?.rssi, let rssi {
            signalMoved = abs(rssi - previous) >= 3
        } else {
            signalMoved = false
        }
        guard lastPickerLine?.answer != answer || signalMoved else { return }
        let name: String = switch answer {
        case .none: "none"
        case .holdCloser: "holdCloser"
        case .host: "host"
        }
        lastPickerLine = (answer, rssi)
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
