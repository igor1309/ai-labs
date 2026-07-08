import FolioTellCore
import Foundation
import Testing

struct PlaybackPositionMappingTests {

    @Test func test_previousSentenceStartUTF16Offset_shouldReturnPrecedingSentenceStart_onOffsetInSecondSentence() {

        let previousStart = PlaybackPositionMapping.previousSentenceStartUTF16Offset(
            in: "Winter morning is cold. Frost and sun.",
            from: 30
        )

        #expect(previousStart == 0)
    }

    @Test func test_previousSentenceStartUTF16Offset_shouldReturnZero_onOffsetInFirstSentence() {

        let previousStart = PlaybackPositionMapping.previousSentenceStartUTF16Offset(
            in: "Winter morning is cold. Frost and sun.",
            from: 7
        )

        #expect(previousStart == 0)
    }

    @Test func test_previousSentenceStartUTF16Offset_shouldTreatGapAsPrecedingSentence_onOffsetInWhitespaceBetweenSentences() {

        // Offset 9 is the whitespace after "Two." — it belongs to the second
        // sentence, so previous is the first sentence's start.
        let previousStart = PlaybackPositionMapping.previousSentenceStartUTF16Offset(
            in: "One. Two. Three.",
            from: 9
        )

        #expect(previousStart == 0)
    }

    @Test func test_nextSentenceStartUTF16Offset_shouldReturnFollowingSentenceStart_onOffsetInFirstSentence() {

        let nextStart = PlaybackPositionMapping.nextSentenceStartUTF16Offset(
            in: "Winter morning is cold. Frost and sun.",
            from: 7
        )

        #expect(nextStart == 24)
    }

    @Test func test_nextSentenceStartUTF16Offset_shouldReturnNil_onOffsetInLastSentence() {

        let nextStart = PlaybackPositionMapping.nextSentenceStartUTF16Offset(
            in: "Winter morning is cold. Frost and sun.",
            from: 30
        )

        #expect(nextStart == nil)
    }

    @Test func test_nextSentenceStartUTF16Offset_shouldReturnFollowingSentenceStart_onRussianSentences() {

        let text = "Мороз и солнце. День чудесный."

        let nextStart = PlaybackPositionMapping.nextSentenceStartUTF16Offset(in: text, from: 3)

        #expect(nextStart == (text as NSString).range(of: "День").location)
    }
}
