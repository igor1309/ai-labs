import FolioTellCore
import Testing

struct PlaybackTransportReducerTests {

    @Test func test_reduce_shouldStartSpeakingFromRequest_onPrimaryTappedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .primaryTapped(makeRequest())) {
            $0 = .speaking(makeSession())
        }
    }

    @Test func test_reduce_shouldDeliverBeginSpeaking_onPrimaryTappedInIdle() {

        assert(
            .idle(lastUtteranceToken: 0),
            .primaryTapped(makeRequest()),
            delivers: .beginSpeaking(makeCommand(), replacingCurrentUtterance: false)
        )
    }

    @Test func test_reduce_shouldClampStartOffsetToTextLength_onPrimaryTappedInIdleWithExcessiveOffset() {

        assert(.idle(lastUtteranceToken: 0), .primaryTapped(makeRequest(text: "Short.", startUTF16Offset: 1000))) {
            $0 = .speaking(makeSession(text: "Short.", utteranceStartUTF16Offset: 6, spokenUTF16Offset: 6))
        }
    }

    @Test func test_reduce_shouldDeliverEmptyUtterance_onPrimaryTappedInIdleWithExcessiveOffset() {

        assert(
            .idle(lastUtteranceToken: 0),
            .primaryTapped(makeRequest(text: "Short.", startUTF16Offset: 1000)),
            delivers: .beginSpeaking(makeCommand(text: ""), replacingCurrentUtterance: false)
        )
    }

    @Test func test_reduce_shouldIssueFreshToken_onPrimaryTappedInIdleAfterEarlierPlayback() {

        // Tokens stay monotonic across idle: a replay after stop must not
        // reuse the stopped utterance's token, or its late didCancel would
        // kill the new session.
        assert(.idle(lastUtteranceToken: 1), .primaryTapped(makeRequest())) {
            $0 = .speaking(makeSession(utteranceToken: 2))
        }
    }

    @Test func test_reduce_shouldDeliverFreshToken_onPrimaryTappedInIdleAfterEarlierPlayback() {

        assert(
            .idle(lastUtteranceToken: 1),
            .primaryTapped(makeRequest()),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2), replacingCurrentUtterance: false)
        )
    }

    @Test func test_reduce_shouldRequestPause_onPrimaryTappedWhileSpeaking() {

        assert(.speaking(makeSession()), .primaryTapped(makeRequest())) {
            $0.session.isPauseRequested = true
        }
    }

    @Test func test_reduce_shouldDeliverPause_onPrimaryTappedWhileSpeaking() {

        assert(.speaking(makeSession()), .primaryTapped(makeRequest()), delivers: .pause(utteranceToken: 1))
    }

    @Test func test_reduce_shouldNotChange_onPrimaryTappedWhilePausedWithActiveUtterance() {

        assert(.paused(makeSession()), .primaryTapped(makeRequest()))
    }

    @Test func test_reduce_shouldDeliverResume_onPrimaryTappedWhilePausedWithActiveUtterance() {

        assert(.paused(makeSession()), .primaryTapped(makeRequest()), delivers: .resume(utteranceToken: 1))
    }

    @Test func test_reduce_shouldSpeakFreshUtteranceFromSpokenOffset_onPrimaryTappedWhilePausedWithoutActiveUtterance() {

        assert(.paused(makeSession(spokenUTF16Offset: 16, hasActiveUtterance: false)), .primaryTapped(makeRequest())) {
            $0.becomeSpeaking()
            $0.session.utteranceToken = 2
            $0.session.utteranceStartUTF16Offset = 16
            $0.session.hasActiveUtterance = true
        }
    }

    @Test func test_reduce_shouldDeliverFreshUtteranceFromSpokenOffset_onPrimaryTappedWhilePausedWithoutActiveUtterance() {

        assert(
            .paused(makeSession(spokenUTF16Offset: 16, hasActiveUtterance: false)),
            .primaryTapped(makeRequest()),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2, text: "Frost and sun."), replacingCurrentUtterance: false)
        )
    }

    @Test func test_reduce_shouldPauseAndClearRequest_onAcceptedPauseWhileSpeaking() {

        assert(.speaking(makeSession(isPauseRequested: true)), .pauseResolved(accepted: true, utteranceToken: 1)) {
            $0.becomePaused()
            $0.session.isPauseRequested = false
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onAcceptedPauseWhileSpeaking() {

        assert(.speaking(makeSession(isPauseRequested: true)), .pauseResolved(accepted: true, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldStaySpeakingWithPauseRequested_onRejectedPauseWhileSpeaking() {

        assert(.speaking(makeSession(isPauseRequested: true)), .pauseResolved(accepted: false, utteranceToken: 1))
    }

    @Test func test_reduce_shouldDeliverNothing_onRejectedPauseWhileSpeaking() {

        assert(.speaking(makeSession(isPauseRequested: true)), .pauseResolved(accepted: false, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldKeepPauseRequested_onWordBoundaryAfterRejectedPause() {

        assert(
            .speaking(makeSession(isPauseRequested: true)),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 0)
        )
    }

    @Test func test_reduce_shouldDeliverPauseRetry_onWordBoundaryAfterRejectedPause() {

        assert(
            .speaking(makeSession(isPauseRequested: true)),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 0),
            delivers: .pause(utteranceToken: 1)
        )
    }

    @Test func test_reduce_shouldNotChange_onPauseResolutionInIdle() {

        assert(.idle(lastUtteranceToken: 0), .pauseResolved(accepted: true, utteranceToken: 1))
    }

    @Test func test_reduce_shouldNotChange_onPauseResolutionWhilePaused() {

        assert(.paused(makeSession()), .pauseResolved(accepted: true, utteranceToken: 1))
    }

    @Test func test_reduce_shouldDeliverNothing_onPauseResolutionInIdle() {

        assert(.idle(lastUtteranceToken: 0), .pauseResolved(accepted: true, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldDeliverNothing_onPauseResolutionWhilePaused() {

        assert(.paused(makeSession()), .pauseResolved(accepted: true, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldNotChange_onPauseResolutionWithStaleToken() {

        assert(.speaking(makeSession(utteranceToken: 2, isPauseRequested: true)), .pauseResolved(accepted: true, utteranceToken: 1))
    }

    @Test func test_reduce_shouldDeliverNothing_onPauseResolutionWithStaleToken() {

        assert(
            .speaking(makeSession(utteranceToken: 2, isPauseRequested: true)),
            .pauseResolved(accepted: true, utteranceToken: 1),
            delivers: nil
        )
    }

    @Test func test_reduce_shouldResumeSpeaking_onAcceptedResumeWhilePaused() {

        assert(.paused(makeSession()), .resumeResolved(accepted: true, utteranceToken: 1)) {
            $0.becomeSpeaking()
        }
    }

    @Test func test_reduce_shouldDeliverNothing_onAcceptedResumeWhilePaused() {

        assert(.paused(makeSession()), .resumeResolved(accepted: true, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldSpeakFreshUtteranceFromSpokenOffset_onRejectedResumeWhilePaused() {

        assert(.paused(makeSession(spokenUTF16Offset: 16)), .resumeResolved(accepted: false, utteranceToken: 1)) {
            $0.becomeSpeaking()
            $0.session.utteranceToken = 2
            $0.session.utteranceStartUTF16Offset = 16
        }
    }

    @Test func test_reduce_shouldDeliverReplacingUtterance_onRejectedResumeWhilePaused() {

        assert(
            .paused(makeSession(spokenUTF16Offset: 16)),
            .resumeResolved(accepted: false, utteranceToken: 1),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2, text: "Frost and sun."), replacingCurrentUtterance: true)
        )
    }

    @Test func test_reduce_shouldNotChange_onResumeResolutionInIdle() {

        assert(.idle(lastUtteranceToken: 0), .resumeResolved(accepted: true, utteranceToken: 1))
    }

    @Test func test_reduce_shouldNotChange_onResumeResolutionWhileSpeaking() {

        assert(.speaking(makeSession()), .resumeResolved(accepted: true, utteranceToken: 1))
    }

    @Test func test_reduce_shouldDeliverNothing_onResumeResolutionInIdle() {

        assert(.idle(lastUtteranceToken: 0), .resumeResolved(accepted: true, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldDeliverNothing_onResumeResolutionWhileSpeaking() {

        assert(.speaking(makeSession()), .resumeResolved(accepted: true, utteranceToken: 1), delivers: nil)
    }

    @Test func test_reduce_shouldNotChange_onResumeResolutionWithStaleToken() {

        assert(.paused(makeSession(utteranceToken: 2, hasActiveUtterance: false)), .resumeResolved(accepted: true, utteranceToken: 1))
    }

    @Test func test_reduce_shouldDeliverNothing_onResumeResolutionWithStaleToken() {

        assert(
            .paused(makeSession(utteranceToken: 2, hasActiveUtterance: false)),
            .resumeResolved(accepted: true, utteranceToken: 1),
            delivers: nil
        )
    }

    @Test func test_reduce_shouldGoIdleKeepingToken_onStopTappedWhileSpeaking() {

        assert(.speaking(makeSession()), .stopTapped) {
            $0.becomeIdle()
        }
    }

    @Test func test_reduce_shouldDeliverStopPlayback_onStopTappedWhileSpeaking() {

        assert(.speaking(makeSession()), .stopTapped, delivers: .stopPlayback)
    }

    @Test func test_reduce_shouldGoIdleKeepingToken_onStopTappedWhilePaused() {

        assert(.paused(makeSession()), .stopTapped) {
            $0.becomeIdle()
        }
    }

    @Test func test_reduce_shouldDeliverStopPlayback_onStopTappedWhilePaused() {

        assert(.paused(makeSession()), .stopTapped, delivers: .stopPlayback)
    }

    @Test func test_reduce_shouldNotChange_onStopTappedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .stopTapped)
    }

    @Test func test_reduce_shouldDeliverNothing_onStopTappedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .stopTapped, delivers: nil)
    }

    @Test func test_reduce_shouldNotChange_onStartOverTappedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .startOverTapped)
    }

    @Test func test_reduce_shouldDeliverNotifyStartOver_onStartOverTappedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .startOverTapped, delivers: .notifyStartOver)
    }

    @Test func test_reduce_shouldRestartFromBeginningWithFreshToken_onStartOverTappedWhileSpeaking() {

        assert(.speaking(makeSession(utteranceToken: 3, utteranceStartUTF16Offset: 16, spokenUTF16Offset: 20)), .startOverTapped) {
            $0.session.utteranceToken = 4
            $0.session.utteranceStartUTF16Offset = 0
            $0.session.spokenUTF16Offset = 0
        }
    }

    @Test func test_reduce_shouldDeliverRestartPlayback_onStartOverTappedWhileSpeaking() {

        assert(
            .speaking(makeSession(utteranceToken: 3, utteranceStartUTF16Offset: 16, spokenUTF16Offset: 20)),
            .startOverTapped,
            delivers: .restartPlayback(makeCommand(utteranceToken: 4))
        )
    }

    @Test func test_reduce_shouldSpeakFromBeginningWithFreshToken_onStartOverTappedWhilePaused() {

        assert(.paused(makeSession(spokenUTF16Offset: 20, hasActiveUtterance: false)), .startOverTapped) {
            $0.becomeSpeaking()
            $0.session.utteranceToken = 2
            $0.session.spokenUTF16Offset = 0
            $0.session.hasActiveUtterance = true
        }
    }

    @Test func test_reduce_shouldDeliverRestartPlayback_onStartOverTappedWhilePaused() {

        assert(
            .paused(makeSession(spokenUTF16Offset: 20, hasActiveUtterance: false)),
            .startOverTapped,
            delivers: .restartPlayback(makeCommand(utteranceToken: 2))
        )
    }

    @Test func test_reduce_shouldReplaceUtteranceAtSpokenOffsetWithNewSpeed_onSpeedChangedWhileSpeaking() {

        assert(.speaking(makeSession(spokenUTF16Offset: 16)), .speedChanged(.oneAndHalf)) {
            $0.session.speed = .oneAndHalf
            $0.session.utteranceToken = 2
            $0.session.utteranceStartUTF16Offset = 16
        }
    }

    @Test func test_reduce_shouldDeliverReplacingUtteranceWithNewSpeed_onSpeedChangedWhileSpeaking() {

        assert(
            .speaking(makeSession(spokenUTF16Offset: 16)),
            .speedChanged(.oneAndHalf),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2, text: "Frost and sun.", speed: .oneAndHalf), replacingCurrentUtterance: true)
        )
    }

    @Test func test_reduce_shouldResumeSpeakingWithNewSpeed_onSpeedChangedWhilePaused() {

        assert(.paused(makeSession()), .speedChanged(.oneAndHalf)) {
            $0.becomeSpeaking()
            $0.session.speed = .oneAndHalf
            $0.session.utteranceToken = 2
        }
    }

    @Test func test_reduce_shouldDeliverReplacingUtteranceWithNewSpeed_onSpeedChangedWhilePaused() {

        assert(
            .paused(makeSession()),
            .speedChanged(.oneAndHalf),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2, speed: .oneAndHalf), replacingCurrentUtterance: true)
        )
    }

    @Test func test_reduce_shouldNotChange_onUnchangedSpeed() {

        assert(.speaking(makeSession(speed: .one)), .speedChanged(.one))
    }

    @Test func test_reduce_shouldDeliverNothing_onUnchangedSpeed() {

        assert(
            .speaking(makeSession(speed: .one)),
            .speedChanged(.one),
            delivers: nil
        )
    }

    @Test func test_reduce_shouldNotChange_onSpeedChangedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .speedChanged(.oneAndHalf))
    }

    @Test func test_reduce_shouldDeliverNothing_onSpeedChangedInIdle() {

        assert(
            .idle(lastUtteranceToken: 0),
            .speedChanged(.oneAndHalf),
            delivers: nil
        )
    }

    @Test func test_reduce_shouldReplaceUtteranceWithNewVoice_onVoiceChangedWhileSpeaking() {

        assert(.speaking(makeSession()), .voiceChanged("voice.ru")) {
            $0.session.voiceIdentifier = "voice.ru"
            $0.session.utteranceToken = 2
        }
    }

    @Test func test_reduce_shouldDeliverReplacingUtteranceWithNewVoice_onVoiceChangedWhileSpeaking() {

        assert(
            .speaking(makeSession()),
            .voiceChanged("voice.ru"),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2, voiceIdentifier: "voice.ru"), replacingCurrentUtterance: true)
        )
    }

    @Test func test_reduce_shouldResumeSpeakingWithNewVoice_onVoiceChangedWhilePaused() {

        assert(.paused(makeSession()), .voiceChanged("voice.ru")) {
            $0.becomeSpeaking()
            $0.session.voiceIdentifier = "voice.ru"
            $0.session.utteranceToken = 2
        }
    }

    @Test func test_reduce_shouldDeliverReplacingUtteranceWithNewVoice_onVoiceChangedWhilePaused() {

        assert(
            .paused(makeSession()),
            .voiceChanged("voice.ru"),
            delivers: .beginSpeaking(makeCommand(utteranceToken: 2, voiceIdentifier: "voice.ru"), replacingCurrentUtterance: true)
        )
    }

    @Test func test_reduce_shouldNotChange_onUnchangedVoice() {

        assert(.speaking(makeSession(voiceIdentifier: nil)), .voiceChanged(nil))
    }

    @Test func test_reduce_shouldDeliverNothing_onUnchangedVoice() {

        assert(
            .speaking(makeSession(voiceIdentifier: nil)),
            .voiceChanged(nil),
            delivers: nil
        )
    }

    @Test func test_reduce_shouldNotChange_onVoiceChangedInIdle() {

        assert(.idle(lastUtteranceToken: 0), .voiceChanged("voice.ru"))
    }

    @Test func test_reduce_shouldDeliverNothing_onVoiceChangedInIdle() {

        assert(
            .idle(lastUtteranceToken: 0),
            .voiceChanged("voice.ru"),
            delivers: nil
        )
    }

    @Test func test_reduce_shouldReplaceUtteranceAtNextSentence_onJumpNextWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession(spokenUTF16Offset: 3)), .jumpToNextSentenceTapped)

        #expect(state == .speaking(makeSession(
            utteranceToken: 2,
            utteranceStartUTF16Offset: 16,
            spokenUTF16Offset: 16
        )))
        #expect(effect == .beginSpeaking(
            makeCommand(utteranceToken: 2, text: "Frost and sun."),
            replacingCurrentUtterance: true
        ))
    }

    @Test func test_reduce_shouldIgnoreJumpNext_onLastSentenceWhileSpeaking() {

        let lastSentence = makeSession(spokenUTF16Offset: 20)

        let (state, effect) = reduce(.speaking(lastSentence), .jumpToNextSentenceTapped)

        #expect(state == .speaking(lastSentence))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldReplaceUtteranceAtPreviousSentenceStart_onJumpPreviousWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession(spokenUTF16Offset: 20)), .jumpToPreviousSentenceTapped)

        #expect(state == .speaking(makeSession(utteranceToken: 2)))
        #expect(effect == .beginSpeaking(
            makeCommand(utteranceToken: 2),
            replacingCurrentUtterance: true
        ))
    }

    @Test func test_reduce_shouldRestartFirstSentence_onJumpPreviousInFirstSentenceWhileSpeaking() {

        let (state, _) = reduce(.speaking(makeSession(spokenUTF16Offset: 3)), .jumpToPreviousSentenceTapped)

        #expect(state == .speaking(makeSession(utteranceToken: 2)))
    }

    @Test func test_reduce_shouldRepositionAndCancelUtterance_onJumpNextWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession(spokenUTF16Offset: 3)), .jumpToNextSentenceTapped)

        #expect(state == .paused(makeSession(
            utteranceToken: 2,
            utteranceStartUTF16Offset: 16,
            spokenUTF16Offset: 16,
            hasActiveUtterance: false
        )))
        #expect(effect == .cancelUtterance)
    }

    @Test func test_reduce_shouldRepositionAndCancelUtterance_onJumpPreviousWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession(spokenUTF16Offset: 20)), .jumpToPreviousSentenceTapped)

        #expect(state == .paused(makeSession(
            utteranceToken: 2,
            utteranceStartUTF16Offset: 0,
            spokenUTF16Offset: 0,
            hasActiveUtterance: false
        )))
        #expect(effect == .cancelUtterance)
    }

    @Test func test_reduce_shouldIgnoreJumpNext_onLastSentenceWhilePaused() {

        let lastSentence = makeSession(spokenUTF16Offset: 20)

        let (state, effect) = reduce(.paused(lastSentence), .jumpToNextSentenceTapped)

        #expect(state == .paused(lastSentence))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldNotifyIdleJump_onJumpTapsInIdle() {

        let results = [
            reduce(.idle(lastUtteranceToken: 0),.jumpToNextSentenceTapped),
            reduce(.idle(lastUtteranceToken: 0),.jumpToPreviousSentenceTapped),
        ]

        #expect(results.map(\.0) == [.idle(lastUtteranceToken: 0), .idle(lastUtteranceToken: 0)])
        #expect(results.map(\.1) == [.notifyIdleJump(.next), .notifyIdleJump(.previous)])
    }

    @Test func test_reduce_shouldAdvanceSpokenOffsetFromUtteranceStart_onWillSpeakRangeWithCurrentToken() {

        let speaking = makeSession(utteranceStartUTF16Offset: 16, spokenUTF16Offset: 16)

        let (state, effect) = reduce(
            .speaking(speaking),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 6)
        )

        #expect(state == .speaking(makeSession(utteranceStartUTF16Offset: 16, spokenUTF16Offset: 22)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldClampSpokenOffsetToTextLength_onWillSpeakRangeBeyondEnd() {

        let (state, _) = reduce(
            .speaking(makeSession()),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 1000)
        )

        #expect(state == .speaking(makeSession(spokenUTF16Offset: 30)))
    }

    @Test func test_reduce_shouldIgnoreWillSpeakRange_onStaleToken() {

        let (state, effect) = reduce(
            .speaking(makeSession(utteranceToken: 2)),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 6)
        )

        #expect(state == .speaking(makeSession(utteranceToken: 2)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldIgnoreWillSpeakRange_onIdle() {

        let (state, effect) = reduce(
            .idle(lastUtteranceToken: 1),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 6)
        )

        #expect(state == .idle(lastUtteranceToken: 1))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldAdvancePausedBoundary_onWillSpeakRangeWithCurrentTokenWhilePaused() {

        // A word-boundary callback can land just after an accepted pause; the
        // paused position must track it so resume does not repeat the word.
        let (state, effect) = reduce(
            .paused(makeSession()),
            .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 6)
        )

        #expect(state == .paused(makeSession(spokenUTF16Offset: 6)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldFinishPlayback_onDidFinishWithCurrentTokenWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .utteranceDidFinish(utteranceToken: 1))

        #expect(state == .idle(lastUtteranceToken: 1))
        #expect(effect == .finishPlayback)
    }

    @Test func test_reduce_shouldFinishPlayback_onDidFinishWithCurrentTokenWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession()), .utteranceDidFinish(utteranceToken: 1))

        #expect(state == .idle(lastUtteranceToken: 1))
        #expect(effect == .finishPlayback)
    }

    @Test func test_reduce_shouldIgnoreDidFinish_onStaleToken() {

        let (state, effect) = reduce(
            .speaking(makeSession(utteranceToken: 2)),
            .utteranceDidFinish(utteranceToken: 1)
        )

        #expect(state == .speaking(makeSession(utteranceToken: 2)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldIgnoreDidFinish_onIdleAfterStop() {

        let (state, effect) = reduce(.idle(lastUtteranceToken: 0),.utteranceDidFinish(utteranceToken: 1))

        #expect(state == .idle(lastUtteranceToken: 0))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldDeactivateAudioSession_onExternalCancelWithCurrentTokenWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .utteranceDidCancel(utteranceToken: 1))

        #expect(state == .idle(lastUtteranceToken: 1))
        #expect(effect == .deactivateAudioSession)
    }

    @Test func test_reduce_shouldDeactivateAudioSession_onExternalCancelWithCurrentTokenWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession()), .utteranceDidCancel(utteranceToken: 1))

        #expect(state == .idle(lastUtteranceToken: 1))
        #expect(effect == .deactivateAudioSession)
    }

    @Test func test_reduce_shouldIgnoreDidCancel_onStaleTokenFromUtteranceReplacement() {

        let (state, effect) = reduce(
            .speaking(makeSession(utteranceToken: 2)),
            .utteranceDidCancel(utteranceToken: 1)
        )

        #expect(state == .speaking(makeSession(utteranceToken: 2)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldIgnoreDidCancel_onIdleAfterStop() {

        let (state, effect) = reduce(.idle(lastUtteranceToken: 0),.utteranceDidCancel(utteranceToken: 1))

        #expect(state == .idle(lastUtteranceToken: 0))
        #expect(effect == nil)
    }

    // MARK: - Helpers

    private typealias State = PlaybackTransportState
    private typealias Event = PlaybackTransportEvent
    private typealias Effect = PlaybackTransportEffect

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
        _ state: PlaybackTransportState,
        _ event: PlaybackTransportEvent
    ) -> (PlaybackTransportState, PlaybackTransportEffect?) {

        return PlaybackTransportReducer().reduce(state, event)
    }

    private func makeRequest(
        text: String = "Winter morning. Frost and sun.",
        speed: SpeechSpeed = .one,
        voiceIdentifier: String? = nil,
        startUTF16Offset: Int = 0
    ) -> PlaybackRequest {

        return PlaybackRequest(
            text: text,
            speed: speed,
            voiceIdentifier: voiceIdentifier,
            startUTF16Offset: startUTF16Offset
        )
    }

    private func makeSession(
        text: String = "Winter morning. Frost and sun.",
        speed: SpeechSpeed = .one,
        voiceIdentifier: String? = nil,
        utteranceToken: Int = 1,
        utteranceStartUTF16Offset: Int = 0,
        spokenUTF16Offset: Int = 0,
        hasActiveUtterance: Bool = true,
        isPauseRequested: Bool = false
    ) -> PlaybackSession {

        return PlaybackSession(
            text: text,
            speed: speed,
            voiceIdentifier: voiceIdentifier,
            utteranceToken: utteranceToken,
            utteranceStartUTF16Offset: utteranceStartUTF16Offset,
            spokenUTF16Offset: spokenUTF16Offset,
            hasActiveUtterance: hasActiveUtterance,
            isPauseRequested: isPauseRequested
        )
    }

    private func makeCommand(
        utteranceToken: Int = 1,
        text: String = "Winter morning. Frost and sun.",
        speed: SpeechSpeed = .one,
        voiceIdentifier: String? = nil,
        languageCode: String? = "en-US"
    ) -> SpeakCommand {

        return SpeakCommand(
            utteranceToken: utteranceToken,
            text: text,
            speed: speed,
            voiceIdentifier: voiceIdentifier,
            languageCode: languageCode
        )
    }
}

/// Test-only access to the session a speaking or paused state carries, and
/// the case changes the reducer makes, so an expected state is the given state
/// plus a mutation.
private extension PlaybackTransportState {

    var session: PlaybackSession {

        get {
            switch self {
            case .idle:
                Issue.record("no session in idle")
                return PlaybackSession(
                    text: "", speed: .one, voiceIdentifier: nil, utteranceToken: 0,
                    utteranceStartUTF16Offset: 0, spokenUTF16Offset: 0, hasActiveUtterance: false
                )
            case let .speaking(session), let .paused(session):
                return session
            }
        }

        set {
            switch self {
            case .idle:
                Issue.record("no session in idle")
            case .speaking:
                self = .speaking(newValue)
            case .paused:
                self = .paused(newValue)
            }
        }
    }

    mutating func becomeSpeaking() {

        self = .speaking(session)
    }

    mutating func becomePaused() {

        self = .paused(session)
    }

    mutating func becomeIdle() {

        self = .idle(lastUtteranceToken: session.utteranceToken)
    }
}
