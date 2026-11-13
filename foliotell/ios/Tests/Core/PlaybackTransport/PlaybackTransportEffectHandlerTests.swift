import FolioTellCore
import Testing

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

    @Test func test_handleEffect_shouldOnlyPause_onPause() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.pause(utteranceToken: 7)) { _ in }

        #expect(log.calls == [.pause])
    }

    @Test func test_handleEffect_shouldDeliverAcceptedPauseWithToken_onPauseAccepted() {

        let (sut, _) = makeSUT(pauseResult: true)

        expect(sut, with: .pause(utteranceToken: 7), toDeliver: .pauseResolved(accepted: true, utteranceToken: 7))
    }

    @Test func test_handleEffect_shouldDeliverRejectedPauseWithToken_onPauseRejected() {

        let (sut, _) = makeSUT(pauseResult: false)

        expect(sut, with: .pause(utteranceToken: 7), toDeliver: .pauseResolved(accepted: false, utteranceToken: 7))
    }

    @Test func test_handleEffect_shouldOnlyResume_onResume() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.resume(utteranceToken: 7)) { _ in }

        #expect(log.calls == [.resume])
    }

    @Test func test_handleEffect_shouldDeliverAcceptedResumeWithToken_onResumeAccepted() {

        let (sut, _) = makeSUT(resumeResult: true)

        expect(sut, with: .resume(utteranceToken: 7), toDeliver: .resumeResolved(accepted: true, utteranceToken: 7))
    }

    @Test func test_handleEffect_shouldDeliverRejectedResumeWithToken_onResumeRejected() {

        let (sut, _) = makeSUT(resumeResult: false)

        expect(sut, with: .resume(utteranceToken: 7), toDeliver: .resumeResolved(accepted: false, utteranceToken: 7))
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

    private func expect(
        _ sut: SUT,
        with effect: PlaybackTransportEffect,
        toDeliver expected: PlaybackTransportEvent?,
        sourceLocation: SourceLocation = #_sourceLocation
    ) {

        var delivered = [PlaybackTransportEvent]()

        sut.handleEffect(effect) { delivered.append($0) }

        #expect(delivered == (expected.map { [$0] } ?? []), sourceLocation: sourceLocation)
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
