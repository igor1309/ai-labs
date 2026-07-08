import FolioTellCore
import Testing

struct PlaybackTransportStateTests {

    @Test func test_playbackState_shouldProjectUIState_onEachTransportState() {

        let states: [PlaybackTransportState] = [
            .idle(lastUtteranceToken: 0),
            .speaking(makeSession()),
            .paused(makeSession()),
        ]

        #expect(states.map(\.playbackState) == [.idle, .speaking, .paused])
    }

    @Test func test_spokenUTF16Offset_shouldExposeSessionOffset_onActiveStates() {

        let states: [PlaybackTransportState] = [
            .idle(lastUtteranceToken: 0),
            .speaking(makeSession(spokenUTF16Offset: 7)),
            .paused(makeSession(spokenUTF16Offset: 16)),
        ]

        #expect(states.map(\.spokenUTF16Offset) == [nil, 7, 16])
    }

    // MARK: - Helpers

    private func makeSession(spokenUTF16Offset: Int = 0) -> PlaybackSession {

        return PlaybackSession(
            text: "Winter morning. Frost and sun.",
            speed: .one,
            voiceIdentifier: nil,
            utteranceToken: 1,
            utteranceStartUTF16Offset: 0,
            spokenUTF16Offset: spokenUTF16Offset,
            hasActiveUtterance: true
        )
    }
}
