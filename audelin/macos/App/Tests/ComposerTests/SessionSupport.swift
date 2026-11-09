import Composer
import BlockingTestWork
import Foundation
import LiveText
import Testing
import Synchronization

final class CaptureScript<Piece: Sendable>: Sendable {

    private let current = Mutex(AsyncThrowingStream<Piece, any Error>.makeStream())
    var source: (stream: AsyncThrowingStream<Piece, any Error>, continuation: AsyncThrowingStream<Piece, any Error>.Continuation) { current.withLock { $0 } }
    let starts = Values<Bool>()
    let stops = Values<Bool>()
    let stopped = Signal()
    let first: Piece
    let last: Piece
    let fails: Bool
    let stopFails: Bool
    let stopEndsStream: Bool
    let streamFails: Bool

    init(
        first: Piece, last: Piece, fails: Bool, stopFails: Bool = false, stopEndsStream: Bool = true,
        streamFails: Bool = false
    ) {

        self.first = first
        self.last = last
        self.fails = fails
        self.stopFails = stopFails
        self.stopEndsStream = stopEndsStream
        self.streamFails = streamFails
    }

    func start() throws -> StartedCapture<Piece> {

        if !starts.all.isEmpty { current.withLock { $0 = AsyncThrowingStream.makeStream() } }
        let source = source
        starts.append(true)
        if fails { throw ScriptFailure.failed }
        if streamFails { source.continuation.finish(throwing: ScriptFailure.failed) }
        else { source.continuation.yield(first) }
        return StartedCapture(stream: source.stream, stop: {
            self.stops.append(true)
            source.continuation.yield(self.last)
            if self.stopEndsStream { source.continuation.finish() }
            self.stopped.send()
            if self.stopFails { throw ScriptFailure.failed }
        })
    }

    func end() { source.continuation.finish(); stopped.end() }
}

actor SessionRecognizer: Recognizer {

    let heard = Signal()
    let name: String
    let onHear: @Sendable () -> Void
    private(set) var chunks: [AudioChunk] = []
    private(set) var finishes = 0

    init(name: String, onHear: @escaping @Sendable () -> Void = {}) {

        self.name = name
        self.onHear = onHear
    }

    func hear(_ chunk: AudioChunk) -> Hearing {

        onHear()
        chunks.append(chunk)
        heard.send()
        return Hearing(words: [.init(name + " pending", start: 0, end: 1.0 / 48_000)])
    }

    func finish() -> Hearing {

        finishes += 1
        return Hearing(words: chunks.isEmpty ? [] : [.init(name + " final", start: 0, end: 1.0 / 48_000)])
    }
}

func recordedSamples(_ url: URL) async throws -> [Float] {
    try await audioFile(url).samples
}
