import CallAudioAccess

import BlockingTestWork
import Foundation
import LiveText
import Synchronization
import Testing

func withComposeFolder(_ body: (URL) async throws -> Void) async throws {

    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("compose-test-\(UUID())")
    try await offPool { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false) }
    let outcome: Result<Void, any Error>
    do { outcome = .success(try await body(folder)) } catch { outcome = .failure(error) }
    do { try await offPool { try FileManager.default.removeItem(at: folder) } }
    catch { Issue.record(error) }
    try outcome.get()
}

final class Values<Value: Sendable>: Sendable {

    private let stored = Mutex<[Value]>([])

    var all: [Value] { stored.withLock { $0 } }

    func append(_ value: Value) { stored.withLock { $0.append(value) } }
    func append(contentsOf values: [Value]) { stored.withLock { $0.append(contentsOf: values) } }
}

struct Signal: Sendable {

    let stream: AsyncStream<Void>
    let continuation: AsyncStream<Void>.Continuation

    init() {

        (stream, continuation) = AsyncStream.makeStream()
    }

    func send() { continuation.yield(()) }
    func end() { continuation.finish() }

    func next() async {

        var iterator = stream.makeAsyncIterator()
        _ = await iterator.next()
    }
}

enum ScriptFailure: Error, Equatable { case failed }

actor ScriptRecognizer: Recognizer {

    private var hearings: [Result<Hearing, ScriptFailure>]
    private var endings: [Result<Hearing, ScriptFailure>]
    private(set) var chunks: [AudioChunk] = []
    private(set) var finishes = 0
    private let blocked: Signal?
    private let release: Signal?
    private let finishing: Signal?
    private let finishRelease: Signal?

    init(
        hearings: [Result<Hearing, ScriptFailure>],
        endings: [Result<Hearing, ScriptFailure>],
        blocked: Signal? = nil, release: Signal? = nil,
        finishing: Signal? = nil, finishRelease: Signal? = nil
    ) {

        self.hearings = hearings
        self.endings = endings
        self.blocked = blocked
        self.release = release
        self.finishing = finishing
        self.finishRelease = finishRelease
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        chunks.append(chunk)
        blocked?.send()
        if let release { await release.next() }
        try Task.checkCancellation()
        guard !hearings.isEmpty else { throw ScriptFailure.failed }
        return try hearings.removeFirst().get()
    }

    func finish() async throws -> Hearing {

        finishes += 1
        finishing?.send()
        if let finishRelease { await finishRelease.next() }
        try Task.checkCancellation()
        guard !endings.isEmpty else { throw ScriptFailure.failed }
        return try endings.removeFirst().get()
    }
}

/// Whether a directory exists at the path; blocking, so callers run it off the pool.
@Sendable func isFolder(_ path: String) -> Bool {

    var directory: ObjCBool = false
    return FileManager.default.fileExists(atPath: path, isDirectory: &directory) && directory.boolValue
}

/// A policy snapshot for tests of condition mapping and unrelated composition.
func testAccessPolicy(available: @escaping @Sendable () -> Bool = { true }) -> AccessPolicy {
    AccessPolicy(refresh: { available() }, reserve: { available() }, release: {}, states: {
        AsyncStream { output in
            var state = AccessState()
            state.evidence = available() ? .heard : .silent
            output.yield(state)
            output.finish()
        }
    }, invalidate: {})
}
