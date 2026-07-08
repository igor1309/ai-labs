import FolioTellCore
import Testing

struct PlaybackTransportReducerTests {

    @Test func test_reduce_shouldStartSpeakingAndBeginSpeaking_onPrimaryTappedInIdle() {

        let (state, effect) = reduce(.idle, .primaryTapped(makeRequest()))

        #expect(state == .speaking(makeSession()))
        #expect(effect == .beginSpeaking(makeCommand(), replacingCurrentUtterance: false))
    }

    @Test func test_reduce_shouldClampStartOffsetToTextLength_onPrimaryTappedInIdleWithExcessiveOffset() {

        let (state, _) = reduce(.idle, .primaryTapped(makeRequest(text: "Short.", startUTF16Offset: 1000)))

        #expect(state == .speaking(makeSession(
            text: "Short.",
            utteranceStartUTF16Offset: 6,
            spokenUTF16Offset: 6
        )))
    }

    @Test func test_reduce_shouldRequestPause_onPrimaryTappedWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .primaryTapped(makeRequest()))

        #expect(state == .speaking(makeSession()))
        #expect(effect == .pause)
    }

    @Test func test_reduce_shouldRequestResume_onPrimaryTappedWhilePausedWithActiveUtterance() {

        let (state, effect) = reduce(.paused(makeSession()), .primaryTapped(makeRequest()))

        #expect(state == .paused(makeSession()))
        #expect(effect == .resume)
    }

    @Test func test_reduce_shouldSpeakFreshUtterance_onPrimaryTappedWhilePausedWithoutActiveUtterance() {

        let paused = makeSession(spokenUTF16Offset: 16, hasActiveUtterance: false)

        let (state, effect) = reduce(.paused(paused), .primaryTapped(makeRequest()))

        #expect(state == .speaking(makeSession(
            utteranceToken: 2,
            utteranceStartUTF16Offset: 16,
            spokenUTF16Offset: 16
        )))
        #expect(effect == .beginSpeaking(
            makeCommand(utteranceToken: 2, text: "Frost and sun."),
            replacingCurrentUtterance: false
        ))
    }

    @Test func test_reduce_shouldPause_onAcceptedPauseWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .pauseResolved(accepted: true))

        #expect(state == .paused(makeSession()))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldStaySpeaking_onRejectedPauseWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .pauseResolved(accepted: false))

        #expect(state == .speaking(makeSession()))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldIgnorePauseResolution_onIdleAndPaused() {

        let results = [
            reduce(.idle, .pauseResolved(accepted: true)),
            reduce(.paused(makeSession()), .pauseResolved(accepted: true)),
        ]

        #expect(results.map(\.0) == [.idle, .paused(makeSession())])
        #expect(results.map(\.1) == [nil, nil])
    }

    @Test func test_reduce_shouldResumeSpeaking_onAcceptedResumeWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession()), .resumeResolved(accepted: true))

        #expect(state == .speaking(makeSession()))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldSpeakFreshUtteranceFromSpokenOffset_onRejectedResumeWhilePaused() {

        let paused = makeSession(spokenUTF16Offset: 16)

        let (state, effect) = reduce(.paused(paused), .resumeResolved(accepted: false))

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

    @Test func test_reduce_shouldIgnoreResumeResolution_onIdleAndSpeaking() {

        let results = [
            reduce(.idle, .resumeResolved(accepted: true)),
            reduce(.speaking(makeSession()), .resumeResolved(accepted: true)),
        ]

        #expect(results.map(\.0) == [.idle, .speaking(makeSession())])
        #expect(results.map(\.1) == [nil, nil])
    }

    @Test func test_reduce_shouldStopPlayback_onStopTappedWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .stopTapped)

        #expect(state == .idle)
        #expect(effect == .stopPlayback)
    }

    @Test func test_reduce_shouldStopPlayback_onStopTappedWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession()), .stopTapped)

        #expect(state == .idle)
        #expect(effect == .stopPlayback)
    }

    @Test func test_reduce_shouldIgnoreStop_onIdle() {

        let (state, effect) = reduce(.idle, .stopTapped)

        #expect(state == .idle)
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldNotifyStartOverOnly_onStartOverTappedInIdle() {

        let (state, effect) = reduce(.idle, .startOverTapped)

        #expect(state == .idle)
        #expect(effect == .notifyStartOver)
    }

    @Test func test_reduce_shouldRestartFromBeginning_onStartOverTappedWhileSpeaking() {

        let speaking = makeSession(utteranceToken: 3, utteranceStartUTF16Offset: 16, spokenUTF16Offset: 20)

        let (state, effect) = reduce(.speaking(speaking), .startOverTapped)

        #expect(state == .speaking(makeSession(utteranceToken: 4)))
        #expect(effect == .restartPlayback(makeCommand(utteranceToken: 4)))
    }

    @Test func test_reduce_shouldRestartFromBeginning_onStartOverTappedWhilePaused() {

        let paused = makeSession(spokenUTF16Offset: 20, hasActiveUtterance: false)

        let (state, effect) = reduce(.paused(paused), .startOverTapped)

        #expect(state == .speaking(makeSession(utteranceToken: 2)))
        #expect(effect == .restartPlayback(makeCommand(utteranceToken: 2)))
    }

    @Test func test_reduce_shouldReplaceUtteranceAtSpokenOffset_onSpeedChangedWhileSpeaking() {

        let speaking = makeSession(spokenUTF16Offset: 16)

        let (state, effect) = reduce(.speaking(speaking), .speedChanged(.oneAndHalf))

        #expect(state == .speaking(makeSession(
            speed: .oneAndHalf,
            utteranceToken: 2,
            utteranceStartUTF16Offset: 16,
            spokenUTF16Offset: 16
        )))
        #expect(effect == .beginSpeaking(
            makeCommand(utteranceToken: 2, text: "Frost and sun.", speed: .oneAndHalf),
            replacingCurrentUtterance: true
        ))
    }

    @Test func test_reduce_shouldResumeSpeakingWithNewSpeed_onSpeedChangedWhilePaused() {

        let (state, _) = reduce(.paused(makeSession()), .speedChanged(.oneAndHalf))

        #expect(state == .speaking(makeSession(speed: .oneAndHalf, utteranceToken: 2)))
    }

    @Test func test_reduce_shouldIgnoreSpeedChange_onUnchangedSpeed() {

        let (state, effect) = reduce(.speaking(makeSession(speed: .one)), .speedChanged(.one))

        #expect(state == .speaking(makeSession(speed: .one)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldIgnoreSpeedChange_onIdle() {

        let (state, effect) = reduce(.idle, .speedChanged(.oneAndHalf))

        #expect(state == .idle)
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldReplaceUtteranceWithNewVoice_onVoiceChangedWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .voiceChanged("voice.ru"))

        #expect(state == .speaking(makeSession(voiceIdentifier: "voice.ru", utteranceToken: 2)))
        #expect(effect == .beginSpeaking(
            makeCommand(utteranceToken: 2, voiceIdentifier: "voice.ru"),
            replacingCurrentUtterance: true
        ))
    }

    @Test func test_reduce_shouldResumeSpeakingWithNewVoice_onVoiceChangedWhilePaused() {

        let (state, _) = reduce(.paused(makeSession()), .voiceChanged("voice.ru"))

        #expect(state == .speaking(makeSession(voiceIdentifier: "voice.ru", utteranceToken: 2)))
    }

    @Test func test_reduce_shouldIgnoreVoiceChange_onUnchangedVoice() {

        let (state, effect) = reduce(.speaking(makeSession(voiceIdentifier: nil)), .voiceChanged(nil))

        #expect(state == .speaking(makeSession(voiceIdentifier: nil)))
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldIgnoreVoiceChange_onIdle() {

        let (state, effect) = reduce(.idle, .voiceChanged("voice.ru"))

        #expect(state == .idle)
        #expect(effect == nil)
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
            reduce(.idle, .jumpToNextSentenceTapped),
            reduce(.idle, .jumpToPreviousSentenceTapped),
        ]

        #expect(results.map(\.0) == [.idle, .idle])
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

    @Test func test_reduce_shouldIgnoreWillSpeakRange_onIdleAndPaused() {

        let results = [
            reduce(.idle, .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 6)),
            reduce(.paused(makeSession()), .willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 6)),
        ]

        #expect(results.map(\.0) == [.idle, .paused(makeSession())])
        #expect(results.map(\.1) == [nil, nil])
    }

    @Test func test_reduce_shouldFinishPlayback_onDidFinishWithCurrentTokenWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .utteranceDidFinish(utteranceToken: 1))

        #expect(state == .idle)
        #expect(effect == .finishPlayback)
    }

    @Test func test_reduce_shouldFinishPlayback_onDidFinishWithCurrentTokenWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession()), .utteranceDidFinish(utteranceToken: 1))

        #expect(state == .idle)
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

        let (state, effect) = reduce(.idle, .utteranceDidFinish(utteranceToken: 1))

        #expect(state == .idle)
        #expect(effect == nil)
    }

    @Test func test_reduce_shouldDeactivateAudioSession_onExternalCancelWithCurrentTokenWhileSpeaking() {

        let (state, effect) = reduce(.speaking(makeSession()), .utteranceDidCancel(utteranceToken: 1))

        #expect(state == .idle)
        #expect(effect == .deactivateAudioSession)
    }

    @Test func test_reduce_shouldDeactivateAudioSession_onExternalCancelWithCurrentTokenWhilePaused() {

        let (state, effect) = reduce(.paused(makeSession()), .utteranceDidCancel(utteranceToken: 1))

        #expect(state == .idle)
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

        let (state, effect) = reduce(.idle, .utteranceDidCancel(utteranceToken: 1))

        #expect(state == .idle)
        #expect(effect == nil)
    }

    // MARK: - Helpers

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
        hasActiveUtterance: Bool = true
    ) -> PlaybackSession {

        return PlaybackSession(
            text: text,
            speed: speed,
            voiceIdentifier: voiceIdentifier,
            utteranceToken: utteranceToken,
            utteranceStartUTF16Offset: utteranceStartUTF16Offset,
            spokenUTF16Offset: spokenUTF16Offset,
            hasActiveUtterance: hasActiveUtterance
        )
    }

    private func makeCommand(
        utteranceToken: Int = 1,
        text: String = "Winter morning. Frost and sun.",
        speed: SpeechSpeed = .one,
        voiceIdentifier: String? = nil,
        languageCode: String? = nil
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
