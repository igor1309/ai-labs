import FolioTellCore
import Testing

struct PlaybackStateMachineTests {

    @Test func test_startSpeaking_shouldSetSpeaking_onIdleStart() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .oneAndHalf, isReplacingUtterance: false)

        #expect(sut.projection == PlaybackProjection(currentSpeed: .oneAndHalf, currentText: "Winter morning", playbackState: .speaking))
    }

    @Test func test_speechCancelled_shouldStaySpeaking_onInternalReplacementCancel() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .one, isReplacingUtterance: true)
        sut.speechCancelled()

        #expect(sut.playbackState == .speaking)
    }

    @Test func test_speechCancelled_shouldSetIdle_onExternalCancel() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .one, isReplacingUtterance: false)
        sut.speechCancelled()

        #expect(sut.playbackState == .idle)
    }

    @Test func test_stopRequested_shouldSetIdle_onSpeaking() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .one, isReplacingUtterance: false)
        sut.stopRequested()

        #expect(sut.playbackState == .idle)
    }

    @Test func test_pauseSucceeded_shouldSetPaused_onSpeaking() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .one, isReplacingUtterance: false)
        sut.pauseSucceeded()

        #expect(sut.playbackState == .paused)
    }

    @Test func test_resumeSucceeded_shouldSetSpeaking_onPaused() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .one, isReplacingUtterance: false)
        sut.pauseSucceeded()
        sut.resumeSucceeded()

        #expect(sut.playbackState == .speaking)
    }

    @Test func test_playbackStateControls_shouldExposePrimaryAction_onPlaybackState() {

        let projections = PlaybackState.allTestCases.map(\.controlsProjection)

        #expect(projections == [
            PlaybackControlsProjection(playbackState: .idle, primaryControlTitle: "Play", primaryControlSystemImage: "play.fill", isStopEnabled: false),
            PlaybackControlsProjection(playbackState: .speaking, primaryControlTitle: "Pause", primaryControlSystemImage: "pause.fill", isStopEnabled: true),
            PlaybackControlsProjection(playbackState: .paused, primaryControlTitle: "Resume", primaryControlSystemImage: "playpause.fill", isStopEnabled: true),
        ])
    }

    @Test func test_applySpeed_shouldRequestRestart_onSpeakingSpeedChange() {

        var sut = PlaybackStateMachine()

        sut.startSpeaking(text: "Winter morning", speed: .one, isReplacingUtterance: false)

        let shouldRestart = sut.applySpeed(.two)

        #expect(shouldRestart)
    }

    @Test func test_applySpeed_shouldNotRequestRestart_onIdleSpeedChange() {

        var sut = PlaybackStateMachine()

        let shouldRestart = sut.applySpeed(.two)

        #expect(shouldRestart == false)
    }
}

// MARK: - Helpers

private struct PlaybackProjection: Equatable {
    let currentSpeed: SpeechSpeed
    let currentText: String
    let playbackState: PlaybackState
}

private struct PlaybackControlsProjection: Equatable {
    let playbackState: PlaybackState
    let primaryControlTitle: String
    let primaryControlSystemImage: String
    let isStopEnabled: Bool
}

private extension PlaybackStateMachine {

    var projection: PlaybackProjection {
        PlaybackProjection(currentSpeed: currentSpeed, currentText: currentText, playbackState: playbackState)
    }
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
