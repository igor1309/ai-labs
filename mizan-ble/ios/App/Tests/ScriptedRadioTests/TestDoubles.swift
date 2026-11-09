import Foundation
import Root
import ScriptedSettings
import MessageCodec
import SessionCrypto
import Testing
@testable import ScriptedRadio

final class TimeSource: ClockPort, @unchecked Sendable {
    private let lock = NSLock()
    private var time = 0.0
    func now() -> Double { lock.withLock { time } }
    func setTime(_ value: Double) { lock.withLock { time = value } }
    func countdown(from count: Int, every interval: Duration) -> AsyncStream<Int> {
        AsyncStream { $0.finish() }
    }
    func ticks(every interval: Duration) -> AsyncStream<Double> {
        AsyncStream { $0.finish() }
    }
}

@MainActor final class Source: SettingsSource {
    var result: SettingsResult
    private var outputs: [AsyncStream<SettingsResult>.Continuation] = []
    var updates: AsyncStream<SettingsResult> {
        let (stream, output) = AsyncStream<SettingsResult>.makeStream()
        outputs.append(output)
        return stream
    }
    init(_ settings: Settings) { result = .valid(settings) }
    func current() -> SettingsResult { result }
    func pulse() { for output in outputs { output.yield(result) } }
    deinit { for output in outputs { output.finish() } }
}

@MainActor final class ManualClock: RadioClock {
    @MainActor final class Step: ScheduledStep {
        let time: Double
        let order: Int
        var action: (@MainActor () -> Void)?
        init(time: Double, order: Int, action: @escaping @MainActor () -> Void) {
            self.time = time; self.order = order; self.action = action
        }
        func cancel() { action = nil }
    }
    var now: Double = 0
    var steps: [Step] = []
    private var serial = 0
    func schedule(after seconds: Double, _ action: @escaping @MainActor () -> Void) -> any ScheduledStep {
        serial += 1
        let step = Step(time: now + seconds, order: serial, action: action)
        steps.append(step)
        return step
    }
    func advance(_ seconds: Double) {
        let end = now + seconds
        while let next = steps.filter({ $0.action != nil && $0.time <= end }).min(by: {
            ($0.time, $0.order) < ($1.time, $1.order)
        }) {
            now = next.time
            let action = next.action
            next.action = nil
            action?()
        }
        now = end
        steps.removeAll { $0.action == nil }
    }
}

@MainActor final class Fixture {
    let source: Source
    let clock = ManualClock()
    let protection = ProtectionSpy()
    let recording = RecordingSpy()
    let host: any HostRadioPort
    let client: any ClientRadioPort
    private var hi: AsyncStream<HostRadioEvent>.Iterator
    private var ci: AsyncStream<ClientRadioEvent>.Iterator
    var he: [HostRadioEvent] = []
    var ce: [ClientRadioEvent] = []
    var hs: HostBluetoothState = .unknown
    var cs: ClientBluetoothState = .unknown

    init(_ settings: Settings = Settings()) async {
        source = Source(settings)
        host = ScriptedHost(source: source, clock: clock, recorder: recording.recorder)
        client = ScriptedClient(source: source, clock: clock, recorder: recording.recorder, sealMessage: protection.seal)
        var hi = host.events.makeAsyncIterator()
        var ci = client.events.makeAsyncIterator()
        self.hi = hi; self.ci = ci
        if case .bluetoothState(let state) = await hi.next(isolation: MainActor.shared) { hs = state }
        if case .bluetooth(let state) = await ci.next(isolation: MainActor.shared) { cs = state }
        self.hi = hi; self.ci = ci
    }

    /// A settings result is an ordered barrier on both event streams.
    func collect() async {
        var hi = self.hi, ci = self.ci
        defer { self.hi = hi; self.ci = ci }
        source.pulse()
        while let event = await hi.next(isolation: MainActor.shared) {
            if case .bluetoothState(let state) = event { hs = state; break }
            he.append(event)
        }
        while let event = await ci.next(isolation: MainActor.shared) {
            if case .bluetooth(let state) = event { cs = state; break }
            ce.append(event)
        }
    }

    func serve(_ app: SessionCrypto, id: UUID) async throws {
        try await host.serve(MessageCodec.encodeSession(.init(publicKey: app.publicKey, sessionID: app.sessionID)), for: id)
        host.advertise("Till", for: id)
        clock.advance(100)
        await collect()
    }
    func hostKey() throws -> [UInt8] {
        try #require(he.compactMap { event -> [UInt8]? in if case .clientKey(_, _, let bytes) = event { bytes } else { nil } }.first)
    }
    func connect() async throws -> (UUID, SessionCrypto) {
        client.startScanning()
        clock.advance(0)
        await collect()
        let id = try #require(ce.compactMap { event -> UUID? in if case .reading(let id, _, _, _) = event { id } else { nil } }.first)
        client.stopScanning()
        client.connect(to: id)
        clock.advance(100)
        await collect()
        let bytes = try #require(ce.compactMap { event -> [UInt8]? in if case .connected(_, let bytes, _) = event { bytes } else { nil } }.first)
        let session = try MessageCodec.decodeSession(bytes)
        let app = try SessionCrypto(sessionID: session.sessionID)
        try app.derive(peerPublicKey: session.publicKey)
        return (id, app)
    }
    func messages(_ app: SessionCrypto) throws -> [MessageCodec.Message] {
        try ce.compactMap { event in
            if case .message(_, let bytes) = event { return try open(bytes, app) }
            return nil
        }
    }
}

func seal(_ message: MessageCodec.Message, _ crypto: SessionCrypto) throws -> [UInt8] {
    let kind: MessageCodec.Kind = switch message {
    case .amount: .amount
    case .decision: .decision
    case .acknowledgement: .acknowledgement
    case .result: .result
    case .end: .end
    }
    let box = try crypto.seal(MessageCodec.encodeBody(message), kind: kind.rawValue)
    return try MessageCodec.encodeFrame(.init(kind: kind, counter: box.counter, sealedBox: box.sealedBox))
}
func open(_ bytes: [UInt8], _ crypto: SessionCrypto) throws -> MessageCodec.Message {
    let frame = try MessageCodec.decodeFrame(bytes)
    let body = try crypto.open(.init(counter: frame.counter, sealedBox: frame.sealedBox), kind: frame.kind.rawValue)
    return try MessageCodec.decodeBody(body, kind: frame.kind)
}

final class LogSpy: LogSink, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [LogEntry] = []
    var entries: [LogEntry] { lock.withLock { storage } }
    func write(_ entry: LogEntry) { lock.withLock { storage.append(entry) } }
}

@MainActor final class ProtectionSpy {
    private(set) var frames: [[UInt8]] = []
    func seal(_ message: MessageCodec.Message, _ crypto: SessionCrypto) throws -> [UInt8] {
        let bytes = try Wire.seal(message, with: crypto)
        frames.append(bytes)
        return bytes
    }
}
