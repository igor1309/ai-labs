@testable import Composer
@testable import LiveText
import Testing

@Suite(.timeLimit(.minutes(1)))
struct TrackTextMappingTests {

    @Test func aSegmentRunsToTheNextStartAndTheLastToTheEnd() {

        let first = Segments.Segment(id: 7, start: 1.25, words: [
            Word("one", start: 1.25, end: 1.75), Word("two", start: 2, end: 2.5),
        ], settledCount: 1)
        let second = Segments.Segment(id: 3, start: 6.5, words: [Word("три", start: 6.5, end: 7)], settledCount: 0)
        let last = Segments.Segment(id: 9, start: 10, words: [Word("four", start: 10, end: 11)], settledCount: 1)
        let cases: [([Segments.Segment], Double, [TranscriptSegment])] = [
            ([], 0, []),
            ([first], 4, [.init(id: 7, start: 1.25, end: 4, words: first.words, settledCount: 1)]),
            ([first, second, last], 12, [
                .init(id: 7, start: 1.25, end: 6.5, words: first.words, settledCount: 1),
                .init(id: 3, start: 6.5, end: 10, words: second.words, settledCount: 0),
                .init(id: 9, start: 10, end: 12, words: last.words, settledCount: 1),
            ]),
        ]
        for (segments, end, expected) in cases {
            #expect(TrackText.text(from: segments, through: end) == expected)
        }
    }

    @Test func identifyingASegmentKeepsItsWordsAndSettledCount() {

        let words = [Word("one", start: 1.25, end: 1.75), Word("two", start: 2, end: 2.5)]
        let segment = TranscriptSegment(id: 7, start: 1.25, end: 4, words: words, settledCount: 1)

        #expect(segment.identified(as: 42) == TranscriptSegment(id: 42, start: 1.25, end: 4, words: words, settledCount: 1))
    }
}
