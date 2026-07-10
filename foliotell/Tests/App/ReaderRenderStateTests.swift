@testable import FolioTellApp
import FolioTellCore
import Testing

struct ReaderRenderStateTests {

    @Test func test_voiceMenuContent_shouldRemainStable_onPlaybackTick() {

        let stateBeforeTick = makeState(progress: 0.25)
        let stateAfterTick = makeState(progress: 0.5)

        #expect(stateBeforeTick.voiceMenuState == stateAfterTick.voiceMenuState)
    }

    @Test func test_playbackMenuContent_shouldRemainStable_onPlaybackTick() {

        let stateBeforeTick = makeState(progress: 0.25)
        let stateAfterTick = makeState(progress: 0.5)

        #expect(stateBeforeTick.playbackMenuState == stateAfterTick.playbackMenuState)
    }

    private func makeState(progress: Double) -> ReaderRenderState {

        ReaderRenderState(
            title: "Document",
            frontMatterText: nil,
            bodyText: "Body",
            progress: progress,
            playbackState: .speaking,
            isStartOverEnabled: true,
            selectedSpeed: .one,
            selectedFrontMatterMode: .skip,
            selectedVoiceIdentifier: "voice",
            voiceOptions: [
                ReaderVoiceOption(id: "voice", menuTitle: "Voice (en-US)"),
            ]
        )
    }
}
