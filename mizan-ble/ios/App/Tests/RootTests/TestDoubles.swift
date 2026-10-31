import Foundation
import Observation
@testable import Root
import Settings

final class LogSpy: LogSink, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [LogEntry] = []
    var entries: [LogEntry] { lock.withLock { storage } }
    private var observer: (@Sendable (LogEntry) -> Void)?
    var onEntry: (@Sendable (LogEntry) -> Void)? {
        get { lock.withLock { observer } }
        set { lock.withLock { observer = newValue } }
    }
    func write(_ entry: LogEntry) {
        let notify = lock.withLock { storage.append(entry); return observer }
        notify?(entry)
    }
}

@MainActor @Observable final class HostSpy: HostRadioPort {
    enum Call: Equatable {
        case serve([UInt8], UUID), advertise(String, UUID), stop(UUID), retire(UUID), finish(UUID), send([UInt8], UUID)
    }
    let events: AsyncStream<HostRadioEvent>
    let continuation: AsyncStream<HostRadioEvent>.Continuation
    var calls: [Call] = []
    var onSend: (([UInt8], UUID) -> Void)?
    var failure: HostRadioFailure?
    init() { (events, continuation) = AsyncStream.makeStream() }
    func serve(_ bytes: [UInt8], for session: UUID) async { calls.append(.serve(bytes, session)) }
    func advertise(_ name: String, for session: UUID) { calls.append(.advertise(name, session)) }
    func stopAdvertising(for session: UUID) { calls.append(.stop(session)) }
    func retire(_ session: UUID) { calls.append(.retire(session)) }
    func finish(_ session: UUID) { calls.append(.finish(session)) }
    func send(_ bytes: [UInt8], for session: UUID) throws(HostRadioFailure) {
        calls.append(.send(bytes, session))
        if let failure { throw failure }
        onSend?(bytes, session)
    }
}

@MainActor @Observable final class ClientSpy: ClientRadioPort {
    enum Call: Equatable { case start, stop, connect(UUID), key([UInt8]), write([UInt8]), drop }
    let events: AsyncStream<ClientRadioEvent>
    let continuation: AsyncStream<ClientRadioEvent>.Continuation
    var calls: [Call] = []
    var result: ClientWriteResult = .success(())
    init() { (events, continuation) = AsyncStream.makeStream() }
    func startScanning() { calls.append(.start) }
    func stopScanning() { calls.append(.stop) }
    func connect(to host: UUID) { calls.append(.connect(host)) }
    func writeKey(_ bytes: [UInt8]) { calls.append(.key(bytes)) }
    func write(_ bytes: [UInt8]) async -> ClientWriteResult { calls.append(.write(bytes)); return result }
    func drop() { calls.append(.drop) }
}

@MainActor struct Harness {
    let host = HostSpy()
    let client = ClientSpy()
    let log = LogSpy()
    let clock = ClockSpy()
    let store = StoreSpy()
    let advertisedName = "MIZAN-7F3A"
    init() { store.set(.text(advertisedName), for: .advertisedName) }
    var pair: RadioPair { .init(host: host, client: client) }
    func finish() { host.continuation.finish(); client.continuation.finish(); clock.finish() }
}

final class StoreSpy: SettingsStore {
    var values: [Settings.Key: Settings.Value] = [:]
    func value(for key: Settings.Key) -> Settings.Value? { values[key] }
    func set(_ value: Settings.Value, for key: Settings.Key) { values[key] = value }
}

@Observable final class ClockSpy: ClockPort, @unchecked Sendable {
    struct CountdownRequest: Equatable {
        let count: Int
        let interval: Duration
    }

    private let lock = NSLock()
    /// Every running countdown, so the broadcast's and the notice's run side by side.
    private var countdowns: [(id: Int, remaining: Int, sink: AsyncStream<Int>.Continuation)] = []
    private var nextID = 0
    private var time = 0.0
    private var tickContinuation: AsyncStream<Double>.Continuation?
    var starts: [Int] { lock.withLock { started.map(\.count) } }
    var countdownRequests: [CountdownRequest] { lock.withLock { started } }
    private var started: [CountdownRequest] = []
    func now() -> Double { lock.withLock { time } }
    func setTime(_ value: Double) { lock.withLock { time = value } }
    func countdown(from count: Int, every interval: Duration) -> AsyncStream<Int> {
        let (stream, sink) = AsyncStream<Int>.makeStream()
        let id = lock.withLock {
            nextID += 1
            countdowns.append((nextID, count, sink))
            started.append(.init(count: count, interval: interval))
            return nextID
        }
        sink.onTermination = { [weak self] _ in self?.lock.withLock { self?.countdowns.removeAll { $0.id == id } } }
        return stream
    }
    func ticks(every interval: Duration) -> AsyncStream<Double> {
        let (stream, sink) = AsyncStream<Double>.makeStream()
        lock.withLock { tickContinuation = sink }
        return stream
    }
    func advance(_ seconds: Int) {
        lock.withLock {
            time += Double(seconds)
            tickContinuation?.yield(time)
            for index in countdowns.indices {
                countdowns[index].remaining = max(0, countdowns[index].remaining - seconds)
            }
        }
        // Yielded outside the lock: a finish runs onTermination, which takes it.
        for countdown in lock.withLock({ countdowns }) {
            countdown.sink.yield(countdown.remaining)
            if countdown.remaining == 0 { countdown.sink.finish() }
        }
    }
    var running: Int { lock.withLock { countdowns.count } }
    func finish() {
        for countdown in lock.withLock({ countdowns }) { countdown.sink.finish() }
        lock.withLock { tickContinuation?.finish() }
    }
}
