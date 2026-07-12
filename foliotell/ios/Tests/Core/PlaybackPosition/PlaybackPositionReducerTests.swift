import FolioTellCore
import Testing

struct PlaybackPositionReducerTests {

    @Test func test_reduce_shouldUpdateLiveOffsetAndRecordAnchor_onSpokenOffsetChanged() {

        let (state, effect) = reduce(makeState(), .spokenOffsetChanged(20))

        #expect(state == makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20))
        #expect(effect == .persistAnchor(documentPath: "/doc.md", anchor: 16))
    }

    @Test func test_reduce_shouldNotPersist_onSpokenOffsetChangedWithinRecordedSentence() {

        let (state, effect) = reduce(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 18),
            .spokenOffsetChanged(20)
        )

        #expect(state == makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldMapSpokenOffsetToDocumentSpace_onMarkdownDocument() {

        // Speech text "Winter. Cold." — spoken offset 10 is inside "Cold.",
        // whose document sentence starts at 10 behind the heading marker; the
        // unsnapped document offset is 12.
        let markdown = makeState(documentText: "# Winter. Cold.")

        let (state, _) = reduce(markdown, .spokenOffsetChanged(10))

        #expect(state == makeState(
            documentText: "# Winter. Cold.",
            storedAnchor: 10,
            liveDocumentUTF16Offset: 12
        ))
    }

    @Test func test_reduce_shouldNotRecordAnchor_onSpokenOffsetChangedWithoutDocumentPath() {

        let (state, effect) = reduce(makeState(documentPath: nil), .spokenOffsetChanged(20))

        #expect(state == makeState(documentPath: nil, liveDocumentUTF16Offset: 20))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldClearPositionAndStore_onPlaybackFinishedNaturally() {

        let (state, effect) = reduce(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .playbackFinishedNaturally
        )

        #expect(state == makeState())
        #expect(effect == .clearAnchor(documentPath: "/doc.md"))
    }

    @Test func test_reduce_shouldClearPositionWithoutStoreEffect_onPlaybackFinishedNaturallyWithoutDocumentPath() {

        let (state, effect) = reduce(
            makeState(documentPath: nil, storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .playbackFinishedNaturally
        )

        #expect(state == makeState(documentPath: nil))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldClearPositionAndStore_onStartOverRequested() {

        let (state, effect) = reduce(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .startOverRequested
        )

        #expect(state == makeState())
        #expect(effect == .clearAnchor(documentPath: "/doc.md"))
    }

    @Test func test_reduce_shouldAnchorNextSentenceAndPersist_onIdleJumpNext() {

        let (state, effect) = reduce(makeState(), .idleJumpRequested(.next))

        #expect(state == makeState(storedAnchor: 16))
        #expect(effect == .persistAnchor(documentPath: "/doc.md", anchor: 16))
    }

    @Test func test_reduce_shouldIgnoreIdleJumpNext_onLastSentence() {

        let lastSentence = makeState(storedAnchor: 16)

        let (state, effect) = reduce(lastSentence, .idleJumpRequested(.next))

        #expect(state == lastSentence)
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldAnchorPreviousSentenceAndPersist_onIdleJumpPrevious() {

        let (state, effect) = reduce(
            makeState(storedAnchor: 16, liveDocumentUTF16Offset: 20),
            .idleJumpRequested(.previous)
        )

        #expect(state == makeState(storedAnchor: 0))
        #expect(effect == .persistAnchor(documentPath: "/doc.md", anchor: 0))
    }

    @Test func test_reduce_shouldDropLiveOffset_onIdleJump() {

        let (state, _) = reduce(
            makeState(liveDocumentUTF16Offset: 3),
            .idleJumpRequested(.next)
        )

        #expect(state.liveDocumentUTF16Offset == nil)
    }

    @Test func test_reduce_shouldAnchorWithoutStoreEffect_onIdleJumpWithoutDocumentPath() {

        let (state, effect) = reduce(makeState(documentPath: nil), .idleJumpRequested(.next))

        #expect(state == makeState(documentPath: nil, storedAnchor: 16))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldRebuildDerivationAndKeepAnchor_onFrontMatterModeChanged() {

        let documentText = "---\ntitle: x\n---\nFrost. Sun."
        let skip = makeState(documentText: documentText, frontMatterMode: .skip, storedAnchor: 24)

        let (state, effect) = reduce(skip, .frontMatterModeChanged(.read))

        #expect(state == makeState(documentText: documentText, frontMatterMode: .read, storedAnchor: 24))
        #expect(state.resumeSpokenUTF16Offset == 16)
        #expect(effect == nil)
    }

    // MARK: - Helpers

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
