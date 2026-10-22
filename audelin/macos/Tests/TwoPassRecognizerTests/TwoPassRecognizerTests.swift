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

    @Test(arguments: [
        DuplicateCase(finalText: "запуску", draftText: "ЗАПУСКУ", start: 1.1, isDuplicate: true),
        DuplicateCase(finalText: "запуску", draftText: "запуску!", start: 1.1, isDuplicate: true),
        DuplicateCase(finalText: "ёлка", draftText: "елка", start: 1.1, isDuplicate: true),
        DuplicateCase(finalText: "запуску", draftText: "запуску", start: 1.499, isDuplicate: true),
        DuplicateCase(finalText: "запуску", draftText: "запуску", start: 1.501, isDuplicate: false),
    ])
    fileprivate func aWordIsNotShownTwice(example: DuplicateCase) async {

        let updates = await run(
            draft: [.init(words: [word(example.draftText, example.start, 1.2), c])],
            final: [.init(words: [a, word(example.finalText, 0.5, 1)], finalThrough: b.end)]
        )

        let pending = example.isDuplicate ? "кто" : "\(example.draftText) кто"
        #expect(read(updates.first) == [segment(start: 0, settled: "по \(example.finalText)", pending: pending)])
    }

    @Test func draftWordsChangeInPlace() async {

        let updates = await run(
            draft: [.init(words: [a, b]), .init(words: [word("подпуску", 0.5, 1), c], from: 0.5)],
            final: [.init(words: []), .init(words: [])]
        )

        #expect(read(updates[1]) == [segment(start: 0, pending: "по подпуску кто")])
    }

    @Test func finishingSettlesTheFinalReading() async {

        let draft = FakeRecognizer([.init(words: [a, word("подпуску", 0.8, 1.1), c])], finishing: .init(words: []))
        let final = FakeRecognizer([.init(words: [a, b], finalThrough: a.end)], finishing: .init(words: [b], finalThrough: b.end))
        let updates = await run(draft: draft, final: final, chunks: 1)

        #expect(read(updates.last) == [segment(start: 0, settled: "по запуску")])
        #expect(updates.last?.ending == .finished)
        #expect(await draft.finishCount == 1)
        #expect(await final.finishCount == 1)
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

        let chunkCount = chunks ?? draft.count
        let draft = FakeRecognizer(draft, finishing: .init(words: []))
        let final = FakeRecognizer(final, finishing: finishing)
        return await run(draft: draft, final: final, chunks: chunkCount)
    }

    private func run(draft: FakeRecognizer, final: FakeRecognizer, chunks: Int) async -> [Segments] {

        let recognizer = TwoPassRecognizer(draft: draft, final: final)
        let live = LiveText(recognizer: recognizer)
        let collecting = Task {
            var updates: [Segments] = []
            for await update in live.updates { updates.append(update) }
            return updates
        }
        await live.listen(to: FiniteSource(chunks: chunks))
        return await collecting.value
    }
}

fileprivate struct DuplicateCase: Sendable {

    let finalText: String
    let draftText: String
    let start: Double
    let isDuplicate: Bool
}

/// Reports the scripted hearings one per chunk, and throws once they run out.
private actor FakeRecognizer: Recognizer {

    struct Failed: Error {}

    private var hearings: [Hearing]
    private let finishing: Hearing
    private(set) var finishCount = 0

    init(_ hearings: [Hearing], finishing: Hearing) {

        self.hearings = hearings
        self.finishing = finishing
    }

    func hear(_ chunk: AudioChunk) throws -> Hearing {

        guard !hearings.isEmpty else { throw Failed() }
        return hearings.removeFirst()
    }

    func finish() -> Hearing {

        finishCount += 1
        return finishing
    }
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
