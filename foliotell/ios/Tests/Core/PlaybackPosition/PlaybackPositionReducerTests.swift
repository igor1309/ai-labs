import FolioTellCore
import Testing

struct PlaybackPositionReducerTests {

    @Test func test_reduce_shouldUpdateLiveOffsetAndRecordAnchor_onSpokenOffsetChanged() {

        assert(makeState(), .spokenOffsetChanged(20)) {
            $0.storedAnchor = 16
            $0.liveDocumentUTF16Offset = 20
        }
    }

    @Test func test_reduce_shouldDeliverPersistAnchor_onSpokenOffsetChanged() {

        assert(makeState(), .spokenOffsetChanged(20), delivers: .persistAnchor(documentPath: "/doc.md", anchor: 16))
    }

    @Test func test_reduce_shouldUpdateLiveOffsetOnly_onSpokenOffsetChangedWithinRecordedSentence() {

        assert(makeState(storedAnchor: 16, liveDocumentUTF16Offset: 18), .spokenOffsetChanged(20)) {
            $0.liveDocumentUTF16Offset = 20
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onSpokenOffsetChangedWithinRecordedSentence() {

        assert(makeState(storedAnchor: 16, liveDocumentUTF16Offset: 18), .spokenOffsetChanged(20), delivers: nil)
    }

    @Test func test_reduce_shouldMapSpokenOffsetToDocumentSpace_onMarkdownDocument() {

        // Speech text "Winter. Cold." — spoken offset 10 is inside "Cold.",
        // whose document sentence starts at 10 behind the heading marker; the
        // unsnapped document offset is 12.
        assert(makeState(documentText: "# Winter. Cold."), .spokenOffsetChanged(10)) {
            $0.storedAnchor = 10
            $0.liveDocumentUTF16Offset = 12
        }
    }

    @Test func test_reduce_shouldDeliverPersistDocumentAnchor_onMarkdownDocument() {

        assert(
            makeState(documentText: "# Winter. Cold."),
            .spokenOffsetChanged(10),
            delivers: .persistAnchor(documentPath: "/doc.md", anchor: 10)
        )
    }

    @Test func test_reduce_shouldUpdateLiveOffsetOnly_onSpokenOffsetChangedWithoutDocumentPath() {

        assert(makeState(documentPath: nil), .spokenOffsetChanged(20)) {
            $0.liveDocumentUTF16Offset = 20
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onSpokenOffsetChangedWithoutDocumentPath() {

        assert(makeState(documentPath: nil), .spokenOffsetChanged(20), delivers: nil)
    }

    @Test func test_reduce_shouldClearPosition_onPlaybackFinishedNaturally() {

        assert(makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20), .playbackFinishedNaturally) {
            $0.storedAnchor = nil
            $0.liveDocumentUTF16Offset = nil
        }
    }

    @Test func test_reduce_shouldDeliverClearAnchor_onPlaybackFinishedNaturally() {

        assert(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .playbackFinishedNaturally,
            delivers: .clearAnchor(documentPath: "/doc.md")
        )
    }

    @Test func test_reduce_shouldClearPosition_onPlaybackFinishedNaturallyWithoutDocumentPath() {

        assert(makeState(documentPath: nil, storedAnchor: 16, liveDocumentUTF16Offset: 20), .playbackFinishedNaturally) {
            $0.storedAnchor = nil
            $0.liveDocumentUTF16Offset = nil
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onPlaybackFinishedNaturallyWithoutDocumentPath() {

        assert(
            makeState(documentPath: nil, storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .playbackFinishedNaturally,
            delivers: nil
        )
    }

    @Test func test_reduce_shouldClearPosition_onStartOverRequested() {

        assert(makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20), .startOverRequested) {
            $0.storedAnchor = nil
            $0.liveDocumentUTF16Offset = nil
        }
    }

    @Test func test_reduce_shouldDeliverClearAnchor_onStartOverRequested() {

        assert(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .startOverRequested,
            delivers: .clearAnchor(documentPath: "/doc.md")
        )
    }

    @Test func test_reduce_shouldAnchorNextSentence_onIdleJumpNext() {

        assert(makeState(), .idleJumpRequested(.next)) {
            $0.storedAnchor = 16
        }
    }

    @Test func test_reduce_shouldDeliverPersistAnchor_onIdleJumpNext() {

        assert(makeState(), .idleJumpRequested(.next), delivers: .persistAnchor(documentPath: "/doc.md", anchor: 16))
    }

    @Test func test_reduce_shouldNotChange_onIdleJumpNextOnLastSentence() {

        assert(makeState(storedAnchor: 16), .idleJumpRequested(.next))
    }

    @Test func test_reduce_shouldDeliverNothing_onIdleJumpNextOnLastSentence() {

        assert(makeState(storedAnchor: 16), .idleJumpRequested(.next), delivers: nil)
    }

    @Test func test_reduce_shouldAnchorPreviousSentenceAndDropLiveOffset_onIdleJumpPrevious() {

        assert(makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20), .idleJumpRequested(.previous)) {
            $0.storedAnchor = 0
            $0.liveDocumentUTF16Offset = nil
        }
    }

    @Test func test_reduce_shouldDeliverPersistAnchor_onIdleJumpPrevious() {

        assert(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .idleJumpRequested(.previous),
            delivers: .persistAnchor(documentPath: "/doc.md", anchor: 0)
        )
    }

    @Test func test_reduce_shouldAnchorNextSentenceAndDropLiveOffset_onIdleJumpNextWithLiveOffset() {

        assert(makeState(liveDocumentUTF16Offset: 3), .idleJumpRequested(.next)) {
            $0.storedAnchor = 16
            $0.liveDocumentUTF16Offset = nil
        }
    }

    @Test func test_reduce_shouldDeliverPersistAnchor_onIdleJumpNextWithLiveOffset() {

        assert(
            makeState(liveDocumentUTF16Offset: 3),
            .idleJumpRequested(.next),
            delivers: .persistAnchor(documentPath: "/doc.md", anchor: 16)
        )
    }

    @Test func test_reduce_shouldAnchorNextSentence_onIdleJumpWithoutDocumentPath() {

        assert(makeState(documentPath: nil), .idleJumpRequested(.next)) {
            $0.storedAnchor = 16
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onIdleJumpWithoutDocumentPath() {

        assert(makeState(documentPath: nil), .idleJumpRequested(.next), delivers: nil)
    }

    @Test func test_reduce_shouldRebuildDerivationAndKeepAnchor_onFrontMatterModeChanged() {

        let skip = makeState(documentText: "---\ntitle: x\n---\nFrost. Sun.", frontMatterMode: .skip, storedAnchor: 24)

        assert(skip, .frontMatterModeChanged(.read)) {
            $0.frontMatterMode = .read
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onFrontMatterModeChanged() {

        let skip = makeState(documentText: "---\ntitle: x\n---\nFrost. Sun.", frontMatterMode: .skip, storedAnchor: 24)

        assert(skip, .frontMatterModeChanged(.read), delivers: nil)
    }

    // MARK: - Helpers

    private typealias State = PlaybackPositionState
    private typealias Event = PlaybackPositionEvent
    private typealias Effect = PlaybackPositionEffect

    private func assert(
        _ state: State,
        _ event: Event,
        sourceLocation: SourceLocation = #_sourceLocation,
        updateStateToExpected: ((inout State) -> Void)? = nil
    ) {

        var expected = state
        updateStateToExpected?(&expected)

        #expect(reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }

    private func assert(
        _ state: State,
        _ event: Event,
        delivers expected: Effect?,
        sourceLocation: SourceLocation = #_sourceLocation
    ) {

        #expect(reduce(state, event).1 == expected, sourceLocation: sourceLocation)
    }

    private func reduce(
        _ state: PlaybackPositionState,
        _ event: PlaybackPositionEvent
    ) -> (PlaybackPositionState, PlaybackPositionEffect?) {

        return PlaybackPositionReducer().reduce(state, event)
    }

    private func makeState(
        documentText: String = "Winter morning. Frost and sun.",
        frontMatterMode: FrontMatterPlaybackMode = .read,
        documentPath: String? = "/doc.md",
        storedAnchor: Int? = nil,
        liveDocumentUTF16Offset: Int? = nil
    ) -> PlaybackPositionState {

        return PlaybackPositionState(
            documentText: documentText,
            frontMatterMode: frontMatterMode,
            documentPath: documentPath,
            storedAnchor: storedAnchor,
            liveDocumentUTF16Offset: liveDocumentUTF16Offset
        )
    }
}
