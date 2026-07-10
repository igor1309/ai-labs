import FolioTellCore
import Testing

struct PlaybackStateTests {

    @Test func test_playbackStateControls_shouldExposePrimaryAction_onPlaybackState() {

        let projections = PlaybackState.allTestCases.map(\.controlsProjection)

        #expect(projections == [
            PlaybackControlsProjection(playbackState: .idle, primaryControlTitle: "Play", primaryControlSystemImage: "play.fill", isStopEnabled: false),
            PlaybackControlsProjection(playbackState: .speaking, primaryControlTitle: "Pause", primaryControlSystemImage: "pause.fill", isStopEnabled: true),
            PlaybackControlsProjection(playbackState: .paused, primaryControlTitle: "Resume", primaryControlSystemImage: "play.fill", isStopEnabled: true),
        ])
    }
}

// MARK: - Helpers

private struct PlaybackControlsProjection: Equatable {
    let playbackState: PlaybackState
    let primaryControlTitle: String
    let primaryControlSystemImage: String
    let isStopEnabled: Bool
}

private extension PlaybackState {

    static var allTestCases: [PlaybackState] {
        [.idle, .speaking, .paused]
    }

    var controlsProjection: PlaybackControlsProjection {
        PlaybackControlsProjection(
            playbackState: self,
            primaryControlTitle: primaryControlTitle,
            primaryControlSystemImage: primaryControlSystemImage,
            isStopEnabled: isStopEnabled
        )
    }
}
