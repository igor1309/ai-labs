/// Reduces playback transport state: utterance lifecycle, pause/resume, jumps,
/// speed and voice changes, and staleness of synthesizer callbacks.
public final class PlaybackTransportReducer {

    public init() {}
}

public extension PlaybackTransportReducer {

    func reduce(
        _ state: State,
        _ event: Event
    ) -> (State, Effect?) {

        switch event {
        case let .primaryTapped(request):
            return primaryTapped(state, request)

        case .stopTapped:
            return stopTapped(state)

        case .startOverTapped:
            return startOverTapped(state)

        case .jumpToNextSentenceTapped:
            return jumpTapped(state, direction: .next)

        case .jumpToPreviousSentenceTapped:
            return jumpTapped(state, direction: .previous)

        case let .speedChanged(speed):
            return settingChanged(state, apply: { $0.speed = speed }, isUnchanged: { $0.speed == speed })

        case let .voiceChanged(voiceIdentifier):
            return settingChanged(
                state,
                apply: { $0.voiceIdentifier = voiceIdentifier },
                isUnchanged: { $0.voiceIdentifier == voiceIdentifier }
            )

        case let .pauseResolved(accepted):
            return pauseResolved(state, accepted: accepted)

        case let .resumeResolved(accepted):
            return resumeResolved(state, accepted: accepted)

        case let .willSpeakRange(utteranceToken, utteranceUTF16Offset):
            return willSpeakRange(state, utteranceToken: utteranceToken, utteranceUTF16Offset: utteranceUTF16Offset)

        case let .utteranceDidFinish(utteranceToken):
            return utteranceEnded(state, utteranceToken: utteranceToken, effect: .finishPlayback)

        case let .utteranceDidCancel(utteranceToken):
            return utteranceEnded(state, utteranceToken: utteranceToken, effect: .deactivateAudioSession)
        }
    }
}

public extension PlaybackTransportReducer {

    typealias State = PlaybackTransportState
    typealias Event = PlaybackTransportEvent
    typealias Effect = PlaybackTransportEffect
}

private extension PlaybackTransportReducer {

    func primaryTapped(_ state: State, _ request: PlaybackRequest) -> (State, Effect?) {

        switch state {
        case .idle:
            let startOffset = min(max(request.startUTF16Offset, 0), request.text.utf16.count)
            let session = PlaybackSession(
                text: request.text,
                speed: request.speed,
                voiceIdentifier: request.voiceIdentifier,
                utteranceToken: 1,
                utteranceStartUTF16Offset: startOffset,
                spokenUTF16Offset: startOffset,
                hasActiveUtterance: true
            )
            return (.speaking(session), .beginSpeaking(command(for: session), replacingCurrentUtterance: false))

        case .speaking:
            return (state, .pause)

        case let .paused(session) where session.hasActiveUtterance:
            return (state, .resume)

        case let .paused(session):
            return speakFreshUtterance(
                session,
                fromUTF16Offset: session.spokenUTF16Offset,
                replacingCurrentUtterance: false
            )
        }
    }

    func stopTapped(_ state: State) -> (State, Effect?) {

        switch state {
        case .idle:
            return (state, nil)

        case .speaking, .paused:
            return (.idle, .stopPlayback)
        }
    }

    func startOverTapped(_ state: State) -> (State, Effect?) {

        switch state {
        case .idle:
            return (state, .notifyStartOver)

        case let .speaking(session), let .paused(session):
            var session = session
            session.utteranceToken += 1
            session.utteranceStartUTF16Offset = 0
            session.spokenUTF16Offset = 0
            session.hasActiveUtterance = true
            return (.speaking(session), .restartPlayback(command(for: session)))
        }
    }

    func willSpeakRange(_ state: State, utteranceToken: Int, utteranceUTF16Offset: Int) -> (State, Effect?) {

        switch state {
        case let .speaking(session) where session.utteranceToken == utteranceToken:
            var session = session
            session.spokenUTF16Offset = min(
                max(session.utteranceStartUTF16Offset + utteranceUTF16Offset, 0),
                session.text.utf16.count
            )
            return (.speaking(session), nil)

        case .idle, .speaking, .paused:
            return (state, nil)
        }
    }

    /// Terminal synthesizer callback for the current utterance moves playback
    /// to idle; stale tokens (replaced utterances, stop already applied) are
    /// ignored.
    func utteranceEnded(_ state: State, utteranceToken: Int, effect: Effect) -> (State, Effect?) {

        switch state {
        case let .speaking(session) where session.utteranceToken == utteranceToken:
            return (.idle, effect)

        case let .paused(session) where session.utteranceToken == utteranceToken:
            return (.idle, effect)

        case .idle, .speaking, .paused:
            return (state, nil)
        }
    }

    func jumpTapped(_ state: State, direction: SentenceJumpDirection) -> (State, Effect?) {

        switch state {
        case .idle:
            return (state, .notifyIdleJump(direction))

        case let .speaking(session):
            guard let target = jumpTargetUTF16Offset(of: session, direction: direction) else {
                return (state, nil)
            }

            return speakFreshUtterance(session, fromUTF16Offset: target, replacingCurrentUtterance: true)

        case let .paused(session):
            guard let target = jumpTargetUTF16Offset(of: session, direction: direction) else {
                return (state, nil)
            }

            var session = session
            session.utteranceToken += 1
            session.utteranceStartUTF16Offset = target
            session.spokenUTF16Offset = target
            session.hasActiveUtterance = false
            return (.paused(session), .cancelUtterance)
        }
    }

    func jumpTargetUTF16Offset(of session: PlaybackSession, direction: SentenceJumpDirection) -> Int? {

        switch direction {
        case .previous:
            PlaybackPositionMapping.previousSentenceStartUTF16Offset(
                in: session.text,
                from: session.spokenUTF16Offset
            )
        case .next:
            PlaybackPositionMapping.nextSentenceStartUTF16Offset(
                in: session.text,
                from: session.spokenUTF16Offset
            )
        }
    }

    /// Applies a session setting change by replacing the current utterance
    /// from the spoken offset; ignored when idle or when the value is
    /// unchanged. Resumes speaking when paused.
    func settingChanged(
        _ state: State,
        apply: (inout PlaybackSession) -> Void,
        isUnchanged: (PlaybackSession) -> Bool
    ) -> (State, Effect?) {

        switch state {
        case .idle:
            return (state, nil)

        case let .speaking(session), let .paused(session):
            guard isUnchanged(session) == false else {
                return (state, nil)
            }

            var session = session
            apply(&session)
            return speakFreshUtterance(
                session,
                fromUTF16Offset: session.spokenUTF16Offset,
                replacingCurrentUtterance: true
            )
        }
    }

    func pauseResolved(_ state: State, accepted: Bool) -> (State, Effect?) {

        switch state {
        case let .speaking(session) where accepted:
            return (.paused(session), nil)

        case .idle, .speaking, .paused:
            return (state, nil)
        }
    }

    func resumeResolved(_ state: State, accepted: Bool) -> (State, Effect?) {

        switch state {
        case let .paused(session) where accepted:
            return (.speaking(session), nil)

        case let .paused(session):
            return speakFreshUtterance(
                session,
                fromUTF16Offset: session.spokenUTF16Offset,
                replacingCurrentUtterance: true
            )

        case .idle, .speaking:
            return (state, nil)
        }
    }

    /// Restart speech with a new utterance token from the given offset.
    func speakFreshUtterance(
        _ session: PlaybackSession,
        fromUTF16Offset offset: Int,
        replacingCurrentUtterance: Bool
    ) -> (State, Effect?) {

        var session = session
        session.utteranceToken += 1
        session.utteranceStartUTF16Offset = min(max(offset, 0), session.text.utf16.count)
        session.spokenUTF16Offset = session.utteranceStartUTF16Offset
        session.hasActiveUtterance = true
        return (.speaking(session), .beginSpeaking(
            command(for: session),
            replacingCurrentUtterance: replacingCurrentUtterance
        ))
    }

    /// Speak the remainder of the session text from the current boundary.
    func command(for session: PlaybackSession) -> SpeakCommand {

        let utteranceText = remainingText(of: session)
        return SpeakCommand(
            utteranceToken: session.utteranceToken,
            text: utteranceText,
            speed: session.speed,
            voiceIdentifier: session.voiceIdentifier,
            languageCode: SpeechVoiceLanguage.languageCode(for: utteranceText)
        )
    }

    func remainingText(of session: PlaybackSession) -> String {

        let text = session.text
        let offset = min(max(session.spokenUTF16Offset, 0), text.utf16.count)
        let utf16Index = text.utf16.index(text.utf16.startIndex, offsetBy: offset)
        guard let index = String.Index(utf16Index, within: text) else {
            return text
        }

        return String(text[index...])
    }
}
