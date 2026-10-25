import Foundation
import LiveText
import Synchronization
import Testing

func withComposeFolder(_ body: (URL) async throws -> Void) async throws {

    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("compose-test-\(UUID())")
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
