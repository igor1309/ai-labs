import Testing
@testable import LiveText

struct QuietSegmentsTests {

    private let sentence = (0..<4).map { Word("word\($0)", start: Double($0), end: Double($0) + 0.5) }

    @Test func aFullSegmentClosesOncePausePassedInQuiet() {

        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: sentence, finalThrough: 3.5, noWordBefore: 5.4))
        #expect(segments.finalCount == 0)

        segments.hear(Hearing(words: [], finalThrough: 8, noWordBefore: 5.5))
        #expect(segments.finalCount == 1)
        #expect(segments.all.map(\.settled) == ["word0 word1 word2 word3"])
        #expect(segments.end == 3.5)
    }

    @Test(arguments: [(words: 2, sentenceEnd: false, closes: false), (words: 2, sentenceEnd: true, closes: true), (words: 3, sentenceEnd: false, closes: true)])
    func aSegmentClosesOnlyWhenTheNextWordWouldCutIt(words: Int, sentenceEnd: Bool, closes: Bool) {

        let said = (0..<words).map { index in
            Word("word\(index)" + (sentenceEnd && index == words - 1 ? "." : ""), start: Double(index), end: Double(index) + 0.5)
        }
        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: said, finalThrough: 100, noWordBefore: 100))
        #expect((segments.finalCount == 1) == closes)
    }

    @Test func aFragmentLeftOpenJoinsTheNextSpeech() {

        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: [Word("yes", start: 0, end: 0.5)], finalThrough: 100, noWordBefore: 100))
        segments.hear(Hearing(words: [Word("well", start: 100, end: 100.5)], finalThrough: 101))
        // Two words either side of a pause, as today: the fragment is not cut.
        #expect(segments.all.map(\.settled) == ["yes well"])
    }

    @Test func aPendingWordKeepsTheSegmentOpen() {

        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: sentence, finalThrough: 1, noWordBefore: 100))
        #expect(segments.finalCount == 0)
    }

    @Test func noBoundChangesNothing() {

        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: sentence, finalThrough: 100))
        #expect(segments.finalCount == 0)
        #expect(segments.noWordBefore == nil)
    }

    @Test func aBoundNeverMovesBack() {

        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: [], noWordBefore: 5))
        segments.hear(Hearing(words: [], noWordBefore: 3))
        #expect(segments.noWordBefore == 5)
    }

    /// Closing early must give the text, starts and order that waiting for the next word gives.
    @Test(arguments: [4, 8, 16])
    func closingInQuietCutsWhereTheNextWordWould(gap: Int) {

        let next = (0..<4).map { Word("next\($0)", start: Double(gap + $0) + 4, end: Double(gap + $0) + 4.5) }
        var early = Segments(pause: 2), late = Segments(pause: 2)
        early.hear(Hearing(words: sentence, finalThrough: 3.5, noWordBefore: 3.5))
        late.hear(Hearing(words: sentence, finalThrough: 3.5))
        early.hear(Hearing(words: [], finalThrough: next[0].start, noWordBefore: next[0].start))
        late.hear(Hearing(words: [], finalThrough: next[0].start))
        early.hear(Hearing(words: next, finalThrough: next[3].end))
        late.hear(Hearing(words: next, finalThrough: next[3].end))

        #expect(early.all.map(\.settled) == late.all.map(\.settled))
        #expect(early.all.map(\.start) == late.all.map(\.start))
        #expect(early.all.map(\.id) == late.all.map(\.id))
    }
}
