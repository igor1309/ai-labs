import Testing
@testable import LiveText

struct LiveTextTests {

    @Test func wordsAppearWhileTheyAreSpoken() async {

        let updates = await run([.init(words: [a, b])])

        #expect(updates.first?.all == [segment(0, start: 0, pending: "по запуску")])
    }

    @Test func pendingWordsChangeInPlace() async {

        let updates = await run([
            .init(words: [a, b], finalThrough: a.end),
            .init(words: [word("подпуску", 0.5, 1), word("кто", 1, 1.5)]),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, settled: "по", pending: "подпуску кто")])
    }

    @Test func pendingWordsNoLongerHeardAreGone() async {

        let updates = await run([
            .init(words: [a, b], finalThrough: a.end),
            .init(words: [], from: b.start),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, settled: "по")])
    }

    @Test func aPendingSegmentNoLongerHeardIsGone() async {

        let updates = await run([
            .init(words: [a, word("кто", 3, 3.5)]),
            .init(words: [], from: 3),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, settled: "по")])
    }

    @Test func wordsSettle() async {

        let updates = await run([
            .init(words: [a, b]),
            .init(words: [a, b], finalThrough: b.end),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, settled: "по запуску")])
    }

    @Test func settledWordsNeverChange() async {

        let updates = await run([
            .init(words: [a, b], finalThrough: b.end),
            .init(words: [word("подпуску", 0, 1)]),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, settled: "по запуску")])
    }

    @Test func aPauseStartsANewSegment() async {

        let updates = await run([
            .init(words: [a, b]),
            .init(words: [word("кто", b.end + 2, b.end + 2.4)]),
        ])

        #expect(updates.dropFirst().first?.all == [
            segment(0, start: 0, settled: "по запуску"),
            segment(1, start: b.end + 2, pending: "кто"),
        ])
    }

    @Test func speechWithoutAPauseStaysOneSegment() async {

        let updates = await run([
            .init(words: [a, b]),
            .init(words: [word("кто", b.end + 1.99, b.end + 2.4)]),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, pending: "по запуску кто")])
    }

    @Test func stoppingKeepsTheTextSoFar() async {

        let source = OpenSource()
        let live = LiveText(recognizer: FakeRecognizer([.init(words: [a, b])], finishing: finishing))
        var updates = live.updates.makeAsyncIterator()

        let listening = Task { await live.listen(to: source) }
        source.send()
        _ = await updates.next()
        await live.stop()
        await listening.value

        var last: Segments?
        while let update = await updates.next() { last = update }
        #expect(last?.all == [segment(0, start: 0, settled: "по запуску кто")])
        #expect(last?.ending == .finished)
    }

    @Test func aFailedRecogniserKeepsTheTextSoFar() async {

        let updates = await run([.init(words: [a, b])], failing: true)

        #expect(updates.last?.all == [segment(0, start: 0, settled: "по запуску")])
        #expect(updates.last?.ending == .failed)
    }

    @Test func theEndOfTheAudioKeepsTheTextSoFar() async {

        let updates = await run([.init(words: [a, b])])

        #expect(updates.last?.all == [segment(0, start: 0, settled: "по запуску кто")])
        #expect(updates.last?.ending == .finished)
    }

    // MARK: - Helpers

    private let a = Word("по", start: 0, end: 0.5)
    private let b = Word("запуску", start: 0.5, end: 1)

    /// The recogniser's last words: the pending one again, and one more.
    private var finishing: Hearing {

        .init(words: [b, word("кто", 1, 1.5)], finalThrough: 1.5)
    }

    private func word(_ text: String, _ start: Double, _ end: Double) -> Word {

        Word(text, start: start, end: end)
    }

    private func segment(_ id: Int, start: Double, settled: String = "", pending: String = "") -> Segments.Segment {

        .init(id: id, start: start, settled: settled, pending: pending)
    }

    /// Feeds one chunk per hearing, then ends the audio, and returns every
    /// update Live text published. With `failing`, the recogniser throws on
    /// the chunk after the last hearing.
    private func run(_ hearings: [Hearing], failing: Bool = false) async -> [Segments] {

        let recognizer = FakeRecognizer(hearings, finishing: finishing)
        let live = LiveText(recognizer: recognizer)
        let chunks = hearings.count + (failing ? 1 : 0)

        let collecting = Task {
            var updates: [Segments] = []
            for await update in live.updates { updates.append(update) }
            return updates
        }
        await live.listen(to: FiniteSource(chunks: chunks))
        return await collecting.value
    }
}

/// Reports the scripted hearings one per chunk, and throws once they run out.
private actor FakeRecognizer: Recognizer {

    struct Failed: Error {}

    private var hearings: [Hearing]
    private let finishing: Hearing

    init(_ hearings: [Hearing], finishing: Hearing) {

        self.hearings = hearings
        self.finishing = finishing
    }

    func hear(_ chunk: AudioChunk) throws -> Hearing {

        guard !hearings.isEmpty else { throw Failed() }
        return hearings.removeFirst()
    }

    func finish() -> Hearing { finishing }
}

/// A number of chunks, then the end of the audio.
private struct FiniteSource: AudioSource {

    let chunks: Int

    func audio() -> AsyncStream<AudioChunk> {

        let (stream, continuation) = AsyncStream<AudioChunk>.makeStream()
        (0..<chunks).forEach { _ in continuation.yield(.init(samples: [0], sampleRate: 16_000)) }
        continuation.finish()
        return stream
    }
}

/// Audio that goes on until the test is done with it.
private final class OpenSource: AudioSource {

    private let stream: AsyncStream<AudioChunk>
    private let continuation: AsyncStream<AudioChunk>.Continuation

    init() {

        (stream, continuation) = AsyncStream.makeStream()
    }

    func audio() -> AsyncStream<AudioChunk> { stream }

    func send() { continuation.yield(.init(samples: [0], sampleRate: 16_000)) }
}
