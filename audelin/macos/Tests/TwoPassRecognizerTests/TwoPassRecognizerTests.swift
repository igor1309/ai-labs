import LiveText
import Testing
import TwoPassRecognizer

struct TwoPassRecognizerTests {

    @Test func draftWordsShowFirst() async {

        let updates = await run(draft: [.init(words: [a, b])], final: [.init(words: [])])

        #expect(read(updates.first) == [segment(start: 0, pending: "по запуску")])
    }

    @Test func theFinalReadingReplacesTheDraft() async {

        let updates = await run(
            draft: [.init(words: [a, word("подпуску", 0.8, 1.1)]), .init(words: [])],
            final: [.init(words: []), .init(words: [word("по", 0, 0.5), word("запуску", 0.5, 1)], finalThrough: 1)]
        )

        #expect(read(updates[1]) == [segment(start: 0, settled: "по запуску")])
    }

    @Test func draftWordsAfterTheFinalWordsStay() async {

        let updates = await run(
            draft: [.init(words: [a, b, c])],
            final: [.init(words: [a, b], finalThrough: a.end)]
        )

        #expect(read(updates.first) == [segment(start: 0, settled: "по", pending: "запуску кто")])
    }

    @Test func aWordIsNotShownTwice() async {

        let updates = await run(
            draft: [.init(words: [word("запуску", 0.8, 1.2), word("кто", 1.6, 1.9)])],
            final: [.init(words: [a, b], finalThrough: b.end)]
        )

        #expect(read(updates.first) == [segment(start: 0, settled: "по запуску", pending: "кто")])
    }

    @Test func draftWordsChangeInPlace() async {

        let updates = await run(
            draft: [.init(words: [a, b]), .init(words: [word("подпуску", 0.5, 1), c], from: 0.5)],
            final: [.init(words: []), .init(words: [])]
        )

        #expect(read(updates[1]) == [segment(start: 0, pending: "по подпуску кто")])
    }

    @Test func finishingSettlesTheFinalReading() async {

        let updates = await run(
            draft: [.init(words: [a, word("подпуску", 0.8, 1.1), c])],
            final: [.init(words: [a, b], finalThrough: a.end)],
            finishing: .init(words: [b], finalThrough: b.end)
        )

        #expect(read(updates.last) == [segment(start: 0, settled: "по запуску")])
        #expect(updates.last?.ending == .finished)
    }

    @Test(arguments: [true, false])
    func aFailingRecogniserFailsTheTwoPassRecogniser(draftFails: Bool) async {

        let shown: [Hearing] = [.init(words: [a])]
        let updates = await run(
            draft: draftFails ? shown : shown + [.init(words: [])],
            final: draftFails ? [.init(words: []), .init(words: [])] : [.init(words: [])],
            chunks: 2
        )

        #expect(read(updates.last) == [segment(start: 0, settled: "по")])
        #expect(updates.last?.ending == .failed)
    }

    // MARK: - Helpers

    private let a = Word("по", start: 0, end: 0.5)
    private let b = Word("запуску", start: 0.5, end: 1)
    private let c = Word("кто", start: 1, end: 1.5)

    private func word(_ text: String, _ start: Double, _ end: Double) -> Word {

        Word(text, start: start, end: end)
    }

    private func segment(start: Double, settled: String = "", pending: String = "") -> String {

        "\(start): \(settled) | \(pending)"
    }

    private func read(_ segments: Segments?) -> [String] {

        segments?.all.map { segment(start: $0.start, settled: $0.settled, pending: $0.pending) } ?? []
    }

    /// Feeds one chunk per draft hearing, or `chunks`, then ends the audio,
    /// and returns every update Live text published.
    private func run(draft: [Hearing], final: [Hearing], finishing: Hearing = .init(words: []), chunks: Int? = nil) async -> [Segments] {

        let recognizer = TwoPassRecognizer(
            draft: FakeRecognizer(draft, finishing: .init(words: [])),
            final: FakeRecognizer(final, finishing: finishing)
        )
        let live = LiveText(recognizer: recognizer)
        let collecting = Task {
            var updates: [Segments] = []
            for await update in live.updates { updates.append(update) }
            return updates
        }
        await live.listen(to: FiniteSource(chunks: chunks ?? draft.count))
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
