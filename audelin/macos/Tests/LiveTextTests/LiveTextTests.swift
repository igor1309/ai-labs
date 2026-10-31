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

        let before = word("Да.", 0, 0.5)
        let updates = await run([
            .init(words: [before, word("кто", 3, 3.5)]),
            .init(words: [], from: 3),
        ])

        #expect(updates[0].all == [
            segment(0, start: 0, pending: "Да."),
            segment(1, start: 3, pending: "кто"),
        ])
        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, pending: "Да.")])
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

        let last = word("запуску.", b.start, b.end)
        let updates = await run([
            .init(words: [a, last]),
            .init(words: [word("кто", b.end + 2, b.end + 2.4)]),
        ])

        #expect(updates.dropFirst().first?.all == [
            segment(0, start: 0, pending: "по запуску."),
            segment(1, start: b.end + 2, pending: "кто"),
        ])
    }

    @Test func wordsBeforeAPauseSettleOnlyWhenFinal() async {

        let last = word("запуску.", b.start, b.end)
        let after = word("кто", b.end + 2, b.end + 2.4)
        let updates = await run([
            .init(words: [a, last]),
            .init(words: [after]),
            .init(words: [], finalThrough: b.end),
        ])

        #expect(updates[1].all.map(\.settled) == ["", ""])
        #expect(updates[2].all == [
            segment(0, start: 0, settled: "по запуску."),
            segment(1, start: after.start, pending: "кто"),
        ])
    }

    @Test func aPauseNoLongerHeardIsGone() async {

        let before = word("Да.", 0, 0.5)
        let updates = await run([
            .init(words: [before, word("кто", 3, 3.5)]),
            .init(words: [before, word("кто", 1, 1.5)]),
        ])

        #expect(updates[0].all.count == 2)
        #expect(updates[1].all == [segment(0, start: 0, pending: "Да. кто")])
    }

    @Test func aPauseBetweenSettledWordsStays() async {

        let last = word("запуску.", b.start, b.end)
        let after = word("кто", b.end + 2, b.end + 2.4)
        let updates = await run([
            .init(words: [a, last, after], finalThrough: after.end),
            .init(words: [word("там", after.end, after.end + 0.4)]),
        ])

        #expect(updates[1].all == [
            segment(0, start: 0, settled: "по запуску."),
            segment(1, start: after.start, settled: "кто", pending: "там"),
        ])
    }

    @Test func speechWithoutAPauseStaysOneSegment() async {

        let updates = await run([
            .init(words: [a, b]),
            .init(words: [word("кто", b.end + 1.99, b.end + 2.4)]),
        ])

        #expect(updates.dropFirst().first?.all == [segment(0, start: 0, pending: "по запуску кто")])
    }

    @Test func aGapShorterThanAPauseKeepsThreeWordsTogether() async {

        let updates = await run([.init(words: [a, b, word("кто", 1, 1.5), word("там", 3.49, 4)])])

        #expect(updates[0].all == [segment(0, start: 0, pending: "по запуску кто там")])
    }

    @Test(arguments: [".", "?", "!", "…"])
    func aLongSegmentEndsAtASentenceEnd(ending: String) async {

        var words = speech(21, start: 7)
        words[9] = word("рано" + ending, 16, 17)
        words[15] = word("конец" + ending, 22, 23)
        let updates = await run([.init(words: words, finalThrough: 28)])

        #expect(updates[0].all == [
            segment(0, start: 7, settled: text(words[..<16])),
            segment(1, start: 23, settled: text(words[16...])),
        ])
    }

    @Test(arguments: [14, 15])
    func sentenceLengthIncludesTheWordEndingAt15s(seconds: Int) async {

        var words = speech(17)
        words[seconds - 1] = word("конец.", Double(seconds - 1), Double(seconds))
        let updates = await run([.init(words: words, finalThrough: 17)])
        let expected = seconds == 15 ? [
            segment(0, start: 0, settled: text(words[..<15])),
            segment(1, start: 15, settled: text(words[15...])),
        ] : [segment(0, start: 0, settled: text(words[...]))]

        #expect(updates[0].all == expected)
    }

    @Test(arguments: [0.0, 0.25])
    func aSegmentWithNoSentenceEndEndsAt30s(overrun: Double) async {

        var words = speech(71, start: 7)
        for index in 30..<words.count {
            words[index].start += overrun
            words[index].end += overrun
        }
        let updates = await run([.init(words: words, finalThrough: 78 + overrun)])

        #expect(updates[0].all == [
            segment(0, start: 7, settled: text(words[..<30])),
            segment(1, start: 37 + overrun, settled: text(words[30..<60])),
            segment(2, start: 67 + overrun, settled: text(words[60...])),
        ])
    }

    @Test func lengthCutsWaitForSettledWords() async {

        var words = speech(21)
        words[15] = word("конец.", 15, 16)
        let updates = await run([
            .init(words: words),
            .init(words: [], finalThrough: 16),
            .init(words: [], finalThrough: 17),
        ])

        #expect(updates[0].all == [segment(0, start: 0, pending: text(words[...]))])
        #expect(updates[1].all == [
            segment(0, start: 0, settled: text(words[..<16]), pending: text(words[16...])),
        ])
        #expect(updates[2].all == [
            segment(0, start: 0, settled: text(words[..<16])),
            segment(1, start: 16, settled: words[16].text, pending: text(words[17...])),
        ])
    }

    @Test func the30sCutWaitsForTheFollowingWordToSettle() async {

        let words = speech(41)
        let updates = await run([
            .init(words: words, finalThrough: 30),
            .init(words: [], finalThrough: 31),
        ])

        #expect(updates[0].all == [
            segment(0, start: 0, settled: text(words[..<30]), pending: text(words[30...])),
        ])
        #expect(updates[1].all == [
            segment(0, start: 0, settled: text(words[..<30])),
            segment(1, start: 30, settled: words[30].text, pending: text(words[31...])),
        ])
    }

    @Test(arguments: [16, 30])
    func settledLengthCutsStayWhenPendingWordsChange(cut: Int) async {

        var words = speech(41)
        if cut == 16 { words[15] = word("конец.", 15, 16) }
        let updates = await run([
            .init(words: words, finalThrough: 35),
            .init(words: [word("замена.", 0, 1), word("дальше!", 35, 36)], from: 0),
            .init(words: [], finalThrough: 36),
        ])
        let prefix = segment(0, start: 0, settled: text(words[..<cut]))

        #expect(updates[0].all == [
            prefix,
            segment(1, start: Double(cut), settled: text(words[cut..<35]), pending: text(words[35...])),
        ])
        #expect(updates[1].all == [
            prefix,
            segment(1, start: Double(cut), settled: text(words[cut..<35]), pending: "дальше!"),
        ])
        #expect(updates[2].all == [
            prefix,
            segment(1, start: Double(cut), settled: text(words[cut..<35]) + " дальше!"),
        ])
    }

    @Test(arguments: [1, 2, 3])
    func aShortFragmentBeforeAPauseJoinsTheNextWords(count: Int) async {

        let before = speech(count)
        let after = word("продолжение.", Double(count) + 2, Double(count) + 3)
        let updates = await run([.init(words: before), .init(words: [after])])
        let expected = count < 3 ? [
            segment(0, start: 0, pending: text(before[...]) + " продолжение."),
        ] : [
            segment(0, start: 0, pending: text(before[...])),
            segment(1, start: after.start, pending: "продолжение."),
        ]

        #expect(updates[1].all == expected)
    }

    @Test func aShortFragmentJoinsTheNextWordsAfterALongSilence() async {

        let updates = await run([
            .init(words: [word("ээ", 0, 0.5), word("продолжение.", 31, 31.5)], finalThrough: 31.5),
        ])

        #expect(updates[0].all == [segment(0, start: 0, settled: "ээ продолжение.")])
    }

    @Test func aShortFragmentAfterASentenceJoinsTheNextWords() async {

        let updates = await run([
            .init(words: [word("Да.", 0, 0.5), word("фрагмент", 3, 3.5), word("дальше", 6, 6.5)]),
        ])

        #expect(updates[0].all == [
            segment(0, start: 0, pending: "Да."),
            segment(1, start: 3, pending: "фрагмент дальше"),
        ])
    }

    @Test(arguments: [".", "?", "!", "…"])
    func aShortSentenceBeforeAPauseStaysItsOwnSegment(ending: String) async {

        let before = [a, word("запуску" + ending, b.start, b.end)]
        let after = word("дальше", 3, 3.5)
        let updates = await run([.init(words: before + [after])])

        #expect(updates[0].all == [
            segment(0, start: 0, pending: "по запуску" + ending),
            segment(1, start: 3, pending: "дальше"),
        ])
    }

    @Test func aSentenceEndBeforeAFragmentStillAllowsAPauseCut() async {

        let updates = await run([.init(words: [word("Да.", 0, 0.5), b, word("дальше", 3, 3.5)])])

        #expect(updates[0].all == [
            segment(0, start: 0, pending: "Да. запуску"),
            segment(1, start: 3, pending: "дальше"),
        ])
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

        var last: SegmentSnapshot?
        while let update = await updates.next() { last = (all: update.segments, ending: update.ending) }
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

    private func speech(_ seconds: Int, start: Double = 0) -> [Word] {

        (0..<seconds).map { word("слово\($0)", start + Double($0), start + Double($0 + 1)) }
    }

    private func text(_ words: ArraySlice<Word>) -> String {

        words.map(\.text).joined(separator: " ")
    }

    private func segment(_ id: Int, start: Double, settled: String = "", pending: String = "") -> Segments.Segment {

        .init(id: id, start: start, settled: settled, pending: pending)
    }

    /// Feeds one chunk per hearing, then ends the audio, and returns every
    /// update Live text published. With `failing`, the recogniser throws on
    /// the chunk after the last hearing.
    private func run(_ hearings: [Hearing], failing: Bool = false) async -> [SegmentSnapshot] {

        let recognizer = FakeRecognizer(hearings, finishing: finishing)
        let live = LiveText(recognizer: recognizer)
        let chunks = hearings.count + (failing ? 1 : 0)

        let collecting = Task {
            var updates: [SegmentSnapshot] = []
            var all: [Segments.Segment] = []
            for await update in live.updates {
                all.replaceSubrange(update.from..., with: update.segments)
                updates.append((all: all, ending: update.ending))
            }
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

private typealias SegmentSnapshot = (all: [Segments.Segment], ending: Segments.Ending?)
