import FolioTellCore
import Testing

@MainActor
struct PlaybackTransportEffectHandlerTests {

    @Test func test_init_shouldNotCallCollaborators() {

        let (_, log) = makeSUT()

        #expect(log.calls.isEmpty)
    }

    @Test func test_handleEffect_shouldActivateSessionThenSpeak_onBeginSpeaking() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.beginSpeaking(makeCommand(), replacingCurrentUtterance: false)) { _ in }

        #expect(log.calls == [.activateAudioSession, .speak(makeCommand())])
    }

    @Test func test_handleEffect_shouldStopBeforeActivateAndSpeak_onBeginSpeakingReplacingUtterance() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.beginSpeaking(makeCommand(), replacingCurrentUtterance: true)) { _ in }

        #expect(log.calls == [.stopSpeaking, .activateAudioSession, .speak(makeCommand())])
    }

    @Test func test_handleEffect_shouldStopThenDeactivateSession_onStopPlayback() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.stopPlayback) { _ in }

        #expect(log.calls == [.stopSpeaking, .deactivateAudioSession])
    }

    @Test func test_handleEffect_shouldOnlyStop_onCancelUtterance() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.cancelUtterance) { _ in }

        #expect(log.calls == [.stopSpeaking])
    }

    @Test func test_handleEffect_shouldDispatchAcceptedPause_onPauseAccepted() {

        let (sut, log) = makeSUT(pauseResult: true)
        var dispatched = [PlaybackTransportEvent]()

        sut.handleEffect(.pause(utteranceToken: 1)) { dispatched.append($0) }

        #expect(log.calls == [.pause])
        #expect(dispatched == [.pauseResolved(accepted: true, utteranceToken: 1)])
    }

    @Test func test_handleEffect_shouldDispatchRejectedPause_onPauseRejected() {

        let (sut, _) = makeSUT(pauseResult: false)
        var dispatched = [PlaybackTransportEvent]()

        sut.handleEffect(.pause(utteranceToken: 1)) { dispatched.append($0) }

        #expect(dispatched == [.pauseResolved(accepted: false, utteranceToken: 1)])
    }

    @Test func test_handleEffect_shouldDispatchAcceptedResume_onResumeAccepted() {

        let (sut, log) = makeSUT(resumeResult: true)
        var dispatched = [PlaybackTransportEvent]()

        sut.handleEffect(.resume(utteranceToken: 1)) { dispatched.append($0) }

        #expect(log.calls == [.resume])
        #expect(dispatched == [.resumeResolved(accepted: true, utteranceToken: 1)])
    }

    @Test func test_handleEffect_shouldDispatchRejectedResume_onResumeRejected() {

        let (sut, _) = makeSUT(resumeResult: false)
        var dispatched = [PlaybackTransportEvent]()

        sut.handleEffect(.resume(utteranceToken: 1)) { dispatched.append($0) }

        #expect(dispatched == [.resumeResolved(accepted: false, utteranceToken: 1)])
    }

    @Test func test_handleEffect_shouldNotifyStartOverThenReplaceUtterance_onRestartPlayback() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.restartPlayback(makeCommand())) { _ in }

        #expect(log.calls == [.notifyStartOver, .stopSpeaking, .activateAudioSession, .speak(makeCommand())])
    }

    @Test func test_handleEffect_shouldOnlyNotifyStartOver_onNotifyStartOver() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.notifyStartOver) { _ in }

        #expect(log.calls == [.notifyStartOver])
    }

    @Test func test_handleEffect_shouldForwardDirection_onNotifyIdleJump() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.notifyIdleJump(.next)) { _ in }

        #expect(log.calls == [.notifyIdleJump(.next)])
    }

    @Test func test_handleEffect_shouldDeactivateSessionThenNotify_onFinishPlayback() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.finishPlayback) { _ in }

        #expect(log.calls == [.deactivateAudioSession, .notifyFinishedNaturally])
    }

    @Test func test_handleEffect_shouldOnlyDeactivateSession_onDeactivateAudioSession() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.deactivateAudioSession) { _ in }

        #expect(log.calls == [.deactivateAudioSession])
    }

    // MARK: - Helpers

    private typealias SUT = PlaybackTransportEffectHandler

    private func makeSUT(
        pauseResult: Bool = true,
        resumeResult: Bool = true
    ) -> (sut: SUT, log: CollaboratorLog) {

        let log = CollaboratorLog()
        let sut = SUT(
            speak: { log.calls.append(.speak($0)) },
            stopSpeaking: { log.calls.append(.stopSpeaking) },
            pause: { log.calls.append(.pause); return pauseResult },
            resume: { log.calls.append(.resume); return resumeResult },
            activateAudioSession: { log.calls.append(.activateAudioSession) },
            deactivateAudioSession: { log.calls.append(.deactivateAudioSession) },
            notifyFinishedNaturally: { log.calls.append(.notifyFinishedNaturally) },
            notifyStartOver: { log.calls.append(.notifyStartOver) },
            notifyIdleJump: { log.calls.append(.notifyIdleJump($0)) }
        )
        return (sut, log)
    }

    private func makeCommand() -> SpeakCommand {

        return SpeakCommand(
            utteranceToken: 1,
            text: "Winter morning. Frost and sun.",
            speed: .one,
            voiceIdentifier: nil,
            languageCode: nil
        )
    }
}

@MainActor
private final class CollaboratorLog {

    enum Call: Equatable {
        case speak(SpeakCommand)
        case stopSpeaking
        case pause
        case resume
        case activateAudioSession
        case deactivateAudioSession
        case notifyFinishedNaturally
        case notifyStartOver
        case notifyIdleJump(SentenceJumpDirection)
    }

    var calls = [Call]()
}
