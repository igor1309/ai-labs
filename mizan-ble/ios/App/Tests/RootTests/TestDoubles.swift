import Foundation
@testable import Root

final class LogSpy: LogSink, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [LogEntry] = []
    var entries: [LogEntry] { lock.withLock { storage } }
    func write(_ entry: LogEntry) { lock.withLock { storage.append(entry) } }
}

@MainActor final class HostSpy: HostRadioPort {
    enum Call: Equatable {
        case serve([UInt8], UUID), advertise(String, UUID), stop(UUID), retire(UUID), finish(UUID), send([UInt8], UUID)
    }
    let events: AsyncStream<HostRadioEvent>
    let continuation: AsyncStream<HostRadioEvent>.Continuation
    var calls: [Call] = []
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
    }
}

@MainActor final class ClientSpy: ClientRadioPort {
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
    var pair: RadioPair { .init(host: host, client: client) }
    func finish() { host.continuation.finish(); client.continuation.finish() }
}
