import FolioTellCore
import Foundation
import Testing

struct PlaybackPositionMappingTests {

    @Test func test_documentAnchor_shouldReturnZero_onOffsetInFirstSentence() {

        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: "Winter morning is cold. Frost and sun.",
            frontMatterMode: .read,
            spokenUTF16Offset: 7
        )

        #expect(anchor == 0)
    }

    @Test func test_documentAnchor_shouldReturnSecondSentenceStart_onOffsetInSecondSentence() {

        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: "Winter morning is cold. Frost and sun.",
            frontMatterMode: .read,
            spokenUTF16Offset: 30
        )

        #expect(anchor == 24)
    }

    @Test func test_documentAnchor_shouldReturnSentenceStart_onHeadingMarkerBeforeSentence() {

        // Speech text is "Winter. Cold." — "Cold." starts at spoken offset 8,
        // while its document sentence starts at offset 10 behind the marker.
        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: "# Winter. Cold.",
            frontMatterMode: .read,
            spokenUTF16Offset: 8
        )

        #expect(anchor == 10)
    }

    @Test func test_documentAnchor_shouldReturnSentenceStart_onListItemSentence() {

        // Speech text is "Frost.\nSun." — "Sun." starts at spoken offset 7,
        // while its document sentence "- Sun." starts at offset 9.
        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: "- Frost.\n- Sun.",
            frontMatterMode: .read,
            spokenUTF16Offset: 8
        )

        #expect(anchor == 9)
    }

    @Test func test_documentAnchor_shouldReturnDocumentSpaceAnchor_onSkippedFrontMatter() {

        // Speech text under .skip is "Frost. Sun." — "Sun." starts at spoken
        // offset 7; its document sentence starts at 24, past the front matter
        // the speech text does not contain.
        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: "---\ntitle: x\n---\nFrost. Sun.",
            frontMatterMode: .skip,
            spokenUTF16Offset: 8
        )

        #expect(anchor == 24)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldReturnSpokenSentenceStart_onBodyAnchor() {

        // Document anchor 10 is "Cold." — its spoken form starts at offset 8
        // in the speech text "Winter. Cold.".
        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: "# Winter. Cold.",
            frontMatterMode: .read,
            documentAnchor: 10
        )

        #expect(resumeOffset == 8)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldNotExceedOriginalOffset_onRoundTrip() {

        let documentText = "# Winter. Cold morning air."
        let midSentenceSpokenOffset = 13

        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: documentText,
            frontMatterMode: .read,
            spokenUTF16Offset: midSentenceSpokenOffset
        )
        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: documentText,
            frontMatterMode: .read,
            documentAnchor: anchor
        )

        #expect(resumeOffset == 8)
        #expect(resumeOffset <= midSentenceSpokenOffset)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldResumeSameSentence_onModeChangedBetweenSaveAndResume() {

        let documentText = "---\ntitle: x\n---\nFrost. Sun."

        // Saved under .read (anchor 24 = "Sun."), resumed under .skip, where
        // the speech text is "Frost. Sun." and "Sun." starts at offset 7.
        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: documentText,
            frontMatterMode: .read,
            spokenUTF16Offset: 17
        )
        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: documentText,
            frontMatterMode: .skip,
            documentAnchor: anchor
        )

        #expect(resumeOffset == 7)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldReturnZero_onAnchorInsideSkippedFrontMatter() {

        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: "---\ntitle: x\n---\nFrost. Sun.",
            frontMatterMode: .skip,
            documentAnchor: 5
        )

        #expect(resumeOffset == 0)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldReturnZero_onAnchorBeyondDocumentLength() {

        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: "Frost. Sun.",
            frontMatterMode: .read,
            documentAnchor: 1000
        )

        #expect(resumeOffset == 0)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldSnapToSentenceStart_onMisalignedAnchor() {

        // Anchor 13 sits mid-word inside "Cold morning." — resume snaps to
        // that sentence's spoken start.
        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: "Winter. Cold morning.",
            frontMatterMode: .read,
            documentAnchor: 13
        )

        #expect(resumeOffset == 8)
    }

    @Test func test_documentAnchor_shouldReturnSentenceStart_onRussianSentences() {

        let documentText = "\u{feff}---\ntitle: \"Зимнее утро\"\n---\n# Зимнее утро\n\nМороз и солнце. День чудесный."
        let speechText = SpeechTextNormalization.speechText(
            from: FrontMatterPlaybackMode.skip.speechText(from: documentText)
        )
        let spokenOffsetInSecondSentence = (speechText as NSString).range(of: "чудесный").location

        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: documentText,
            frontMatterMode: .skip,
            spokenUTF16Offset: spokenOffsetInSecondSentence
        )

        #expect(anchor == (documentText as NSString).range(of: "День").location)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldStartAtSentenceStart_onEmphasisInsideSentence() {

        let documentText = "Мороз и **солнце**. День чудесный."
        let speechText = SpeechTextNormalization.speechText(
            from: FrontMatterPlaybackMode.read.speechText(from: documentText)
        )
        let spokenOffsetInSecondSentence = (speechText as NSString).range(of: "чудесный").location

        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: documentText,
            frontMatterMode: .read,
            spokenUTF16Offset: spokenOffsetInSecondSentence
        )
        let resumeOffset = PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: documentText,
            frontMatterMode: .read,
            documentAnchor: anchor
        )

        #expect(resumeOffset == (speechText as NSString).range(of: "День").location)
    }

    @Test func test_documentUTF16Offset_shouldReturnUnsnappedDocumentOffset_onHeadingMarkerBeforeSentence() {

        // Spoken offset 10 is mid-word inside "Cold." — the document offset
        // is 12, not the sentence start (which documentAnchor would return).
        let documentOffset = PlaybackPositionMapping.documentUTF16Offset(
            documentText: "# Winter. Cold.",
            frontMatterMode: .read,
            spokenUTF16Offset: 10
        )

        #expect(documentOffset == 12)
    }

    @Test func test_documentUTF16Offset_shouldClampToLastSpokenUnit_onOffsetBeyondSpeechEnd() {

        let documentOffset = PlaybackPositionMapping.documentUTF16Offset(
            documentText: "# Winter. Cold.",
            frontMatterMode: .read,
            spokenUTF16Offset: 1000
        )

        #expect(documentOffset == 14)
    }

    @Test func test_documentAnchor_shouldReturnSameAnchor_onReadModeFrontMatter() {

        // Same body sentence as the .skip case: under .read the speech text
        // is "title: x\nFrost. Sun." and "Sun." starts at spoken offset 16,
        // yet the document anchor is the same document-space offset 24.
        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: "---\ntitle: x\n---\nFrost. Sun.",
            frontMatterMode: .read,
            spokenUTF16Offset: 17
        )

        #expect(anchor == 24)
    }
}
