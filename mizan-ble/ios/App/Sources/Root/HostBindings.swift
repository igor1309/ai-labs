import Foundation
import HostBroadcast
import HostPayment
import MessageCodec
import SessionCrypto
import Settings

@MainActor final class HostSession: HostPayment.Session {
    let crypto = SessionCrypto()
    let radioID: UUID
    private let log: any LogSink

    init(log: any LogSink) {
        self.log = log
        let bytes = crypto.sessionID
        radioID = UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                              bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }

    func seal(_ message: HostPayment.Message) throws -> [UInt8] {
        switch message {
        case .acknowledgement: try seal(.acknowledgement(.decision), kind: .acknowledgement)
        case .result(let outcome): try seal(.result(outcome == .success ? .success : .failure), kind: .result)
        case .end: try seal(.end, kind: .end)
        }
    }

    func seal(_ message: MessageCodec.Message, kind: MessageCodec.Kind) throws -> [UInt8] {
        let protected = try crypto.seal(MessageCodec.encodeBody(message), kind: kind.rawValue)
        return try MessageCodec.encodeFrame(.init(kind: kind, counter: protected.counter, sealedBox: protected.sealedBox))
    }

    func open(_ bytes: [UInt8]) throws -> HostPayment.Decision {
        let frame = try MessageCodec.decodeFrame(bytes)
        guard frame.kind == .decision else { throw MessageCodec.CodecError.unreadable }
        let body = try crypto.open(.init(counter: frame.counter, sealedBox: frame.sealedBox), kind: frame.kind.rawValue)
        logMessage(bytes, direction: "opened", category: .hostPayment, log: log)
        guard case .decision(let decision) = try MessageCodec.decodeBody(body, kind: frame.kind) else {
            throw MessageCodec.CodecError.unreadable
        }
        return decision == .confirm ? .confirm : .decline
    }

    func close() { crypto.close() }
}

@MainActor final class PaymentRadio: HostPayment.Sender, HostPayment.Link {
    private let radio: any HostRadioPort
    private let id: UUID
    private let log: any LogSink
    init(radio: any HostRadioPort, id: UUID, log: any LogSink) {
        self.radio = radio
        self.id = id
        self.log = log
    }
    func send(_ bytes: [UInt8]) throws {
        try radio.send(bytes, for: id)
        logMessage(bytes, direction: "sent", category: .hostPayment, log: log)
    }
    func end() { radio.finish(id) }
}

@MainActor final class HostBindings: HostBroadcast.SessionProvider, HostBroadcast.Advertiser,
    HostBroadcast.Sender, HostBroadcast.Countdown, HostBroadcast.CountdownSetting {
    private let radio: any HostRadioPort
    private let clock: any ClockPort
    private let settings: Settings
    private let log: any LogSink
    private var sessions: [HostBroadcast.Attempt: HostSession] = [:]
    private var countdowns: [HostBroadcast.Attempt: Task<Void, Never>] = [:]
    var send: (HostBroadcast.Event) -> Void = { _ in }

    init(radio: any HostRadioPort, clock: any ClockPort, settings: Settings, log: any LogSink) {
        self.radio = radio
        self.clock = clock
        self.settings = settings
        self.log = log
    }
    deinit { for task in countdowns.values { task.cancel() } }

    func open(for attempt: HostBroadcast.Attempt) -> HostBroadcast.Session {
        let session = HostSession(log: log)
        sessions[attempt] = session
        return .init(id: session.crypto.sessionID, publicKey: session.crypto.publicKey)
    }
    func session(for attempt: HostBroadcast.Attempt) -> HostSession? { sessions[attempt] }
    func attempt(for id: UUID) -> HostBroadcast.Attempt? { sessions.first { $0.value.radioID == id }?.key }
    func derive(clientKey: [UInt8], for attempt: HostBroadcast.Attempt) throws {
        try require(attempt).crypto.derive(peerPublicKey: clientKey)
    }
    func seal(amount: String, for attempt: HostBroadcast.Attempt) throws -> HostBroadcast.ProtectedAmount {
        .init(bytes: try require(attempt).seal(.amount(minorUnits(amount)), kind: .amount))
    }
    func close(_ attempt: HostBroadcast.Attempt) { sessions.removeValue(forKey: attempt)?.close() }
    func serve(_ session: HostBroadcast.Session, for attempt: HostBroadcast.Attempt) async throws {
        let id = try require(attempt).radioID
        let bytes = try MessageCodec.encodeSession(.init(publicKey: session.publicKey, sessionID: session.id))
        await radio.serve(bytes, for: id)
    }
    func advertise(_ attempt: HostBroadcast.Attempt) throws {
        radio.advertise(settings.advertisedName, for: try require(attempt).radioID)
    }
    func stopAdvertising(_ attempt: HostBroadcast.Attempt) {
        if let session = sessions[attempt] { radio.stopAdvertising(for: session.radioID) }
    }
    func retire(_ attempt: HostBroadcast.Attempt) {
        if let session = sessions[attempt] { radio.retire(session.radioID) }
    }
    func sendAmount(_ message: HostBroadcast.ProtectedAmount, to link: HostBroadcast.Link, for attempt: HostBroadcast.Attempt) throws {
        try radio.send(message.bytes, for: require(attempt).radioID)
        logMessage(message.bytes, direction: "sent", category: .hostBroadcast, log: log)
    }
    func seconds() -> Int { settings.countdown }
    func start(seconds: Int, for attempt: HostBroadcast.Attempt) {
        stop(attempt)
        let source = clock.countdown(from: seconds, every: .seconds(1))
        let send = send
        countdowns[attempt] = Task.immediate {
            for await remaining in source {
                guard !Task.isCancelled else { return }
                send(.secondsLeft(attempt, remaining))
            }
        }
    }
    func stop(_ attempt: HostBroadcast.Attempt) { countdowns.removeValue(forKey: attempt)?.cancel() }
    func stop() {
        for task in countdowns.values { task.cancel() }
        countdowns.removeAll()
        for session in sessions.values {
            // A closed payment session has already handed its finish to the long-lived radio.
            if !session.crypto.isClosed { radio.retire(session.radioID) }
            session.close()
        }
        sessions.removeAll()
    }
    private func require(_ attempt: HostBroadcast.Attempt) throws -> HostSession {
        guard let session = sessions[attempt] else { throw SessionCrypto.SessionError.closed }
        return session
    }
}

/// Decimal keys are converted as integers so no floating point rounding crosses the wire.
func minorUnits(_ amount: String) -> UInt64 {
    let parts = amount.split(separator: ".", omittingEmptySubsequences: false)
    let whole = UInt64(parts[0]) ?? 0
    let fraction = parts.count > 1 ? String(parts[1]) : ""
    return whole * 100 + (UInt64((fraction + "00").prefix(2)) ?? 0)
}
