import Synchronization
import Testing
@testable import LiveText

@Suite(.timeLimit(.minutes(1)))
struct RecognitionStreamTests {

    @Test func aSegmentRunsToTheNextStartAndTheLastToTheEnd() {

        let first = Segments.Segment(id: 7, start: 1.25, words: [
            Word("one", start: 1.25, end: 1.75), Word("two", start: 2, end: 2.5),
        ], settledCount: 1)
        let second = Segments.Segment(id: 3, start: 6.5, words: [Word("три", start: 6.5, end: 7)], settledCount: 0)
        let last = Segments.Segment(id: 9, start: 10, words: [Word("four", start: 10, end: 11)], settledCount: 1)
        let cases: [([Segments.Segment], Double, [RecognitionStream.Segment])] = [
            ([], 0, []),
            ([first], 4, [.init(id: 7, start: 1.25, end: 4, words: first.words, settledCount: 1)]),
            ([first, second, last], 12, [
                .init(id: 7, start: 1.25, end: 6.5, words: first.words, settledCount: 1),
                .init(id: 3, start: 6.5, end: 10, words: second.words, settledCount: 0),
                .init(id: 9, start: 10, end: 12, words: last.words, settledCount: 1),
            ]),
        ]
        for (segments, end, expected) in cases {
            #expect(RecognitionStream.segments(segments, through: end) == expected)
        }
    }

    @Test func hearingBeforePrepareFails() async {

        let stream = RecognitionStream(recognizerSource: { ScriptRecognizer([]) })

        await #expect(throws: RecognitionStream.Failure.notPrepared) { try await stream.hear(audio(0)) }
        await #expect(throws: RecognitionStream.Failure.notPrepared) { try await stream.finish() }
    }

    @Test func eachIntervalAddsItsFinalTextOnceAndReplacesTheTail() async throws {

        let recognizer = ScriptRecognizer([
            .init(words: [first], finalThrough: first.end, noWordBefore: 3),
            .init(words: [draft], noWordBefore: 5),
            .init(words: [second], finalThrough: second.end),
        ], finishing: .init(words: [last]))
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        let closed = segment(0, [first], settled: 1, end: first.end)

        let one = try await stream.hear(audio(0))
        let two = try await stream.hear(audio(1))
        let three = try await stream.hear(audio(2))
        let ending = try await stream.finish()

        #expect(one == .init(final: [closed], tail: [], noTextBefore: 3))
        #expect(two == .init(final: [closed], tail: [segment(1, [draft], settled: 0, end: draft.end)], noTextBefore: 5))
        #expect(three == .init(final: [closed], tail: [segment(1, [second], settled: 1, end: second.end)], noTextBefore: 5))
        #expect(ending == .init(final: [closed, segment(1, [second, last], settled: 2, end: last.end)], tail: [], noTextBefore: 5))
        #expect(await recognizer.chunks == [[0], [1], [2]])
        #expect(await recognizer.finishes == 1)
    }

    @Test func aFailedRecognitionEndsTheSession() async throws {

        let recognizer = ScriptRecognizer([.init(words: [first])], failingAfter: 1)
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        _ = try await stream.hear(audio(0))

        await #expect(throws: RecognitionStream.Failure.updateFailed) { try await stream.hear(audio(1)) }
        await #expect(throws: RecognitionStream.Failure.notPrepared) { try await stream.hear(audio(2)) }
    }

    @Test func aFailedLoadLeavesTheStreamUnprepared() async {

        let stream = RecognitionStream(recognizerSource: { throw LoadFailed() })

        await #expect(throws: LoadFailed.self) { try await stream.prepare() }
        await #expect(throws: RecognitionStream.Failure.notPrepared) { try await stream.hear(audio(0)) }
    }

    @Test func theRecognizerLoadsOnceForEveryPrepare() async throws {

        let source = GatedSource(ScriptRecognizer([]))
        source.release()
        let stream = RecognitionStream(recognizerSource: { try await source.load() })

        try await stream.prepare()
        _ = try await stream.finish()
        try await stream.prepare()

        #expect(source.loads == 1)
    }

    @Test func aCancelledPrepareLeavesTheLoadForTheNext() async throws {

        let source = GatedSource(ScriptRecognizer([.init(words: [first])]))
        let stream = RecognitionStream(recognizerSource: { try await source.load() })
        let waiting = Task { try await stream.prepare() }
        await source.started()

        waiting.cancel()
        await #expect(throws: CancellationError.self) { try await waiting.value }
        source.release()
        try await stream.prepare()

        #expect(try await stream.hear(audio(0)).tail.map(\.words) == [[first]])
        #expect(source.loads == 1)
    }

    @Test func aReplayAfterACancelledHearReturnsTheAcceptedUpdate() async throws {

        let recognizer = HeldRecognizer(ScriptRecognizer([.init(words: [first])]))
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        let cancelled = Task { try await stream.hear(audio(0)) }
        await recognizer.heard()

        cancelled.cancel()
        await #expect(throws: CancellationError.self) { try await cancelled.value }
        recognizer.release()
        let replay = try await stream.hear(audio(0))

        #expect(replay.tail.map(\.words) == [[first]])
        #expect(await recognizer.base.chunks == [[0]])
    }

    @Test func aReplayHearsOnlyAudioAfterTheAccepted() async throws {

        let recognizer = ScriptRecognizer([.init(words: [first]), .init(words: [first, draft])])
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        _ = try await stream.hear(.init(start: 0, samples: [0, 1], sampleRate: 1))

        let inside = try await stream.hear(.init(start: 0, samples: [0, 1], sampleRate: 1))
        let overlapping = try await stream.hear(.init(start: 1, samples: [1, 2, 3], sampleRate: 1))

        #expect(inside.tail.map(\.words) == [[first]])
        #expect(overlapping.tail.map(\.words) == [[first], [draft]])
        #expect(await recognizer.chunks == [[0, 1], [2, 3]])
    }

    @Test func finishAfterACancelledHearKeepsItsText() async throws {

        let recognizer = HeldRecognizer(ScriptRecognizer([.init(words: [first])], finishing: .init(words: [first])))
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        let cancelled = Task { try await stream.hear(audio(0)) }
        await recognizer.heard()
        cancelled.cancel()
        _ = try? await cancelled.value
        recognizer.release()

        let ending = try await stream.finish()

        #expect(ending.final.map(\.words) == [[first]])
        #expect(await recognizer.base.chunks == [[0]])
    }

    @Test func cancellingHearingEndsTheHearInFlightAndKeepsItsInterval() async throws {

        let recognizer = HeldRecognizer(ScriptRecognizer([.init(words: [first])]))
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        let running = Task { try await stream.hear(audio(0)) }
        await recognizer.heard()

        await stream.cancelHearing()

        await #expect(throws: CancellationError.self) { try await running.value }
        recognizer.release()
        #expect(try await stream.hear(audio(0)).tail.map(\.words) == [[first]])
        #expect(await recognizer.base.chunks == [[0]])
    }

    @Test func cancellingHearingWithNothingInFlightReturns() async throws {

        let stream = RecognitionStream(recognizerSource: { ScriptRecognizer([.init(words: [first])]) })
        try await stream.prepare()

        await stream.cancelHearing()

        #expect(try await stream.hear(audio(0)).tail.map(\.words) == [[first]])
    }

    @Test func shutdownEndsTheSessionWithoutAnotherUpdate() async throws {

        let recognizer = ScriptRecognizer([.init(words: [first])])
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        _ = try await stream.hear(audio(0))

        await stream.shutdown()

        await #expect(throws: RecognitionStream.Failure.notPrepared) { try await stream.hear(audio(1)) }
    }

    @Test func aPrepareAfterFinishStartsFromNoText() async throws {

        let recognizer = ScriptRecognizer([.init(words: [first], finalThrough: first.end), .init(words: [draft])])
        let stream = RecognitionStream(recognizerSource: { recognizer })
        try await stream.prepare()
        _ = try await stream.hear(audio(0))
        _ = try await stream.finish()
        try await stream.prepare()

        let update = try await stream.hear(audio(1))

        #expect(update == .init(final: [], tail: [segment(0, [draft], settled: 0, end: draft.end)]))
    }
}

private let first = Word("Hello.", start: 0, end: 0.5)
private let draft = Word("draft", start: 5, end: 5.5)
private let second = Word("next.", start: 5, end: 5.5)
private let last = Word("last", start: 5.5, end: 6)

private struct LoadFailed: Error {}

private func audio(_ value: Float) -> RecognitionStream.Audio {

    .init(start: Double(value), samples: [value], sampleRate: 1)
}

private func segment(_ id: Int, _ words: [Word], settled: Int, end: Double) -> RecognitionStream.Segment {

    .init(id: id, start: words[0].start, end: end, words: words, settledCount: settled)
}

/// Answers each chunk with the next scripted hearing.
actor ScriptRecognizer: Recognizer {

    struct Failed: Error {}

    private var hearings: [Hearing]
    private let finishing: Hearing
    private let failingAfter: Int?
    private(set) var chunks: [[Float]] = []
    private(set) var finishes = 0

    init(_ hearings: [Hearing], finishing: Hearing = .init(words: []), failingAfter: Int? = nil) {

        self.hearings = hearings
        self.finishing = finishing
        self.failingAfter = failingAfter
    }

    func hear(_ chunk: AudioChunk) throws -> Hearing {

        chunks.append(chunk.samples)
        if let failingAfter, chunks.count > failingAfter { throw Failed() }
        return hearings.isEmpty ? .init(words: []) : hearings.removeFirst()
    }

    func finish() -> Hearing {

        finishes += 1
        return finishing
    }
}

/// Hands out its recogniser once released, ignoring cancellation as a slow
/// model load does.
private final class GatedSource: Sendable {

    private let recognizer: any Recognizer
    private let gate = AsyncStream<Void>.makeStream()
    private let calls = AsyncStream<Void>.makeStream()
    private let count = Mutex(0)

    init(_ recognizer: any Recognizer) { self.recognizer = recognizer }

    var loads: Int { count.withLock { $0 } }

    func load() async throws -> any Recognizer {

        count.withLock { $0 += 1 }
        calls.continuation.yield()
        for await _ in gate.stream { break }
        return recognizer
    }

    func started() async { for await _ in calls.stream { break } }

    func release() { gate.continuation.yield(); gate.continuation.finish() }
}

/// Holds its first hearing until released.
private final class HeldRecognizer: Recognizer {

    let base: ScriptRecognizer
    private let gate = AsyncStream<Void>.makeStream()
    private let calls = AsyncStream<Void>.makeStream()

    init(_ base: ScriptRecognizer) { self.base = base }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        let hearing = try await base.hear(chunk)
        calls.continuation.yield()
        for await _ in gate.stream { break }
        return hearing
    }

    func finish() async throws -> Hearing { await base.finish() }

    func heard() async { for await _ in calls.stream { break } }

    func release() { gate.continuation.yield(); gate.continuation.finish() }
}
