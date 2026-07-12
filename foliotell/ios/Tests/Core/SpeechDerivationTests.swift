import FolioTellCore
import Foundation
import Testing

struct SpeechDerivationTests {

    @Test func test_speechText_shouldExposeNormalizedSpeechText_onMarkdownDocument() {

        let derivation = SpeechDerivation(documentText: "# Winter. Cold.", frontMatterMode: .read)

        #expect(derivation.speechText == "Winter. Cold.")
    }

    @Test func test_documentAnchor_shouldReturnZero_onOffsetInFirstSentence() {

        let derivation = SpeechDerivation(
            documentText: "Winter morning is cold. Frost and sun.",
            frontMatterMode: .read
        )

        #expect(derivation.documentAnchor(forSpokenUTF16Offset: 7) == 0)
    }

    @Test func test_documentAnchor_shouldReturnSecondSentenceStart_onOffsetInSecondSentence() {

        let derivation = SpeechDerivation(
            documentText: "Winter morning is cold. Frost and sun.",
            frontMatterMode: .read
        )

        #expect(derivation.documentAnchor(forSpokenUTF16Offset: 30) == 24)
    }

    @Test func test_documentAnchor_shouldReturnSentenceStart_onHeadingMarkerBeforeSentence() {

        // Speech text is "Winter. Cold." — "Cold." starts at spoken offset 8,
        // while its document sentence starts at offset 10 behind the marker.
        let derivation = SpeechDerivation(documentText: "# Winter. Cold.", frontMatterMode: .read)

        #expect(derivation.documentAnchor(forSpokenUTF16Offset: 8) == 10)
    }

    @Test func test_documentAnchor_shouldReturnSentenceStart_onListItemSentence() {

        // Speech text is "Frost.\nSun." — "Sun." starts at spoken offset 7,
        // while its document sentence "- Sun." starts at offset 9.
        let derivation = SpeechDerivation(documentText: "- Frost.\n- Sun.", frontMatterMode: .read)

        #expect(derivation.documentAnchor(forSpokenUTF16Offset: 8) == 9)
    }

    @Test func test_documentAnchor_shouldReturnDocumentSpaceAnchor_onSkippedFrontMatter() {

        // Speech text under .skip is "Frost. Sun." — "Sun." starts at spoken
        // offset 7; its document sentence starts at 24, past the front matter
        // the speech text does not contain.
        let derivation = SpeechDerivation(
            documentText: "---\ntitle: x\n---\nFrost. Sun.",
            frontMatterMode: .skip
        )

        #expect(derivation.documentAnchor(forSpokenUTF16Offset: 8) == 24)
    }

    @Test func test_documentAnchor_shouldReturnSameAnchor_onReadModeFrontMatter() {

        // Same body sentence as the .skip case: under .read the speech text
        // is "title: x\nFrost. Sun." and "Sun." starts at spoken offset 16,
        // yet the document anchor is the same document-space offset 24.
        let derivation = SpeechDerivation(
            documentText: "---\ntitle: x\n---\nFrost. Sun.",
            frontMatterMode: .read
        )

        #expect(derivation.documentAnchor(forSpokenUTF16Offset: 17) == 24)
    }

    @Test func test_documentAnchor_shouldReturnSentenceStart_onRussianSentences() {

        let documentText = "\u{feff}---\ntitle: \"Зимнее утро\"\n---\n# Зимнее утро\n\nМороз и солнце. День чудесный."
        let derivation = SpeechDerivation(documentText: documentText, frontMatterMode: .skip)
        let spokenOffsetInSecondSentence = (derivation.speechText as NSString).range(of: "чудесный").location

        let anchor = derivation.documentAnchor(forSpokenUTF16Offset: spokenOffsetInSecondSentence)

        #expect(anchor == (documentText as NSString).range(of: "День").location)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldReturnSpokenSentenceStart_onBodyAnchor() {

        // Document anchor 10 is "Cold." — its spoken form starts at offset 8
        // in the speech text "Winter. Cold.".
        let derivation = SpeechDerivation(documentText: "# Winter. Cold.", frontMatterMode: .read)

        #expect(derivation.resumeSpokenUTF16Offset(forDocumentAnchor: 10) == 8)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldNotExceedOriginalOffset_onRoundTrip() {

        let derivation = SpeechDerivation(
            documentText: "# Winter. Cold morning air.",
            frontMatterMode: .read
        )
        let midSentenceSpokenOffset = 13

        let anchor = derivation.documentAnchor(forSpokenUTF16Offset: midSentenceSpokenOffset)
        let resumeOffset = derivation.resumeSpokenUTF16Offset(forDocumentAnchor: anchor)

        #expect(resumeOffset == 8)
        #expect(resumeOffset <= midSentenceSpokenOffset)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldResumeSameSentence_onModeChangedBetweenSaveAndResume() {

        let documentText = "---\ntitle: x\n---\nFrost. Sun."

        // Saved under .read (anchor 24 = "Sun."), resumed under .skip, where
        // the speech text is "Frost. Sun." and "Sun." starts at offset 7.
        let readDerivation = SpeechDerivation(documentText: documentText, frontMatterMode: .read)
        let skipDerivation = SpeechDerivation(documentText: documentText, frontMatterMode: .skip)

        let anchor = readDerivation.documentAnchor(forSpokenUTF16Offset: 17)
        let resumeOffset = skipDerivation.resumeSpokenUTF16Offset(forDocumentAnchor: anchor)

        #expect(resumeOffset == 7)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldReturnZero_onAnchorInsideSkippedFrontMatter() {

        let derivation = SpeechDerivation(
            documentText: "---\ntitle: x\n---\nFrost. Sun.",
            frontMatterMode: .skip
        )

        #expect(derivation.resumeSpokenUTF16Offset(forDocumentAnchor: 5) == 0)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldReturnZero_onAnchorBeyondDocumentLength() {

        let derivation = SpeechDerivation(documentText: "Frost. Sun.", frontMatterMode: .read)

        #expect(derivation.resumeSpokenUTF16Offset(forDocumentAnchor: 1000) == 0)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldSnapToSentenceStart_onMisalignedAnchor() {

        // Anchor 13 sits mid-word inside "Cold morning." — resume snaps to
        // that sentence's spoken start.
        let derivation = SpeechDerivation(
            documentText: "Winter. Cold morning.",
            frontMatterMode: .read
        )

        #expect(derivation.resumeSpokenUTF16Offset(forDocumentAnchor: 13) == 8)
    }

    @Test func test_resumeSpokenUTF16Offset_shouldStartAtSentenceStart_onEmphasisInsideSentence() {

        let derivation = SpeechDerivation(
            documentText: "Мороз и **солнце**. День чудесный.",
            frontMatterMode: .read
        )
        let spokenOffsetInSecondSentence = (derivation.speechText as NSString).range(of: "чудесный").location

        let anchor = derivation.documentAnchor(forSpokenUTF16Offset: spokenOffsetInSecondSentence)
        let resumeOffset = derivation.resumeSpokenUTF16Offset(forDocumentAnchor: anchor)

        #expect(resumeOffset == (derivation.speechText as NSString).range(of: "День").location)
    }

    @Test func test_documentUTF16Offset_shouldReturnUnsnappedDocumentOffset_onHeadingMarkerBeforeSentence() {

        // Spoken offset 10 is mid-word inside "Cold." — the document offset
        // is 12, not the sentence start (which documentAnchor would return).
        let derivation = SpeechDerivation(documentText: "# Winter. Cold.", frontMatterMode: .read)

        #expect(derivation.documentUTF16Offset(forSpokenUTF16Offset: 10) == 12)
    }

    @Test func test_documentUTF16Offset_shouldClampToLastSpokenUnit_onOffsetBeyondSpeechEnd() {

        let derivation = SpeechDerivation(documentText: "# Winter. Cold.", frontMatterMode: .read)

        #expect(derivation.documentUTF16Offset(forSpokenUTF16Offset: 1000) == 14)
    }

    @Test func test_documentUTF16Offset_shouldReturnZero_onEmptySpeechText() {

        let derivation = SpeechDerivation(documentText: "---\ntitle: x\n---\n", frontMatterMode: .skip)

        #expect(derivation.documentUTF16Offset(forSpokenUTF16Offset: 5) == 0)
    }
}
