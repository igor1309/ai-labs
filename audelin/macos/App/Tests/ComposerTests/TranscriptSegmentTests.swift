import Composer
import LiveText
import Testing

@Suite(.timeLimit(.minutes(1)))
struct TranscriptSegmentTests {

    @Test func identifyingASegmentKeepsItsWordsAndSettledCount() {

        let words = [Word("one", start: 1.25, end: 1.75), Word("two", start: 2, end: 2.5)]
        let segment = TranscriptSegment(id: 7, start: 1.25, end: 4, words: words, settledCount: 1)

        #expect(segment.identified(as: 42) == TranscriptSegment(id: 42, start: 1.25, end: 4, words: words, settledCount: 1))
    }
}
