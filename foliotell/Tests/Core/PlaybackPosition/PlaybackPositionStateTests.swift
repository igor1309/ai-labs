import FolioTellCore
import Testing

struct PlaybackPositionStateTests {

    @Test func test_progressFraction_shouldReturnZero_onNoRecordedPosition() {

        #expect(makeState().progressFraction == 0)
    }

    @Test func test_progressFraction_shouldPreferLiveOffsetOverAnchor_onBothRecorded() {

        let state = makeState(storedAnchor: 0, liveDocumentUTF16Offset: 20)

        // "Winter morning. Frost and sun." is 30 UTF16 units; 20/30.
        #expect(abs(state.progressFraction - 20.0 / 30.0) < 0.0001)
    }

    @Test func test_progressFraction_shouldFallBackToAnchor_onNoLiveOffset() {

        let state = makeState(storedAnchor: 16)

        #expect(abs(state.progressFraction - 16.0 / 30.0) < 0.0001)
    }

    @Test func test_progressFraction_shouldClampToOne_onPositionBeyondDocumentLength() {

        let state = makeState(liveDocumentUTF16Offset: 1000)

        #expect(state.progressFraction == 1)
    }

    @Test func test_progressFraction_shouldReturnZero_onEmptyDocument() {

        let state = PlaybackPositionState(
            documentText: "",
            frontMatterMode: .read,
            documentPath: nil,
            liveDocumentUTF16Offset: 5
        )

        #expect(state.progressFraction == 0)
    }

    @Test func test_speechText_shouldExposeDerivedSpeechText_onMarkdownDocument() {

        let state = PlaybackPositionState(
            documentText: "# Winter. Cold.",
            frontMatterMode: .read,
            documentPath: nil
        )

        #expect(state.speechText == "Winter. Cold.")
    }

    // MARK: - Helpers

    private func makeState(
        storedAnchor: Int? = nil,
        liveDocumentUTF16Offset: Int? = nil
    ) -> PlaybackPositionState {

        return PlaybackPositionState(
            documentText: "Winter morning. Frost and sun.",
            frontMatterMode: .read,
            documentPath: "/doc.md",
            storedAnchor: storedAnchor,
            liveDocumentUTF16Offset: liveDocumentUTF16Offset
        )
    }
}
