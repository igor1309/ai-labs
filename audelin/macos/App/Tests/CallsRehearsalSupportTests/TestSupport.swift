import Foundation
import Synchronization
import Testing

func withRehearsalFolder(_ body: (URL) async throws -> Void) async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("calls-rehearsal-test-\(UUID())", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    defer {
        do { try FileManager.default.removeItem(at: folder) }
        catch { Issue.record(error) }
    }
    try await body(folder)
}

final class Values<Value: Sendable>: Sendable {
    private let stored = Mutex<[Value]>([])
    var all: [Value] { stored.withLock { $0 } }
    func append(_ value: Value) { stored.withLock { $0.append(value) } }
}

struct Signal: Sendable {
    private let stream: AsyncStream<Void>
    private let continuation: AsyncStream<Void>.Continuation
    init() { (stream, continuation) = AsyncStream.makeStream() }
    func send() { continuation.yield(()) }
    func next() async {
        var iterator = stream.makeAsyncIterator()
        _ = await iterator.next()
    }
}
