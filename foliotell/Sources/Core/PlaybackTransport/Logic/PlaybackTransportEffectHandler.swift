/// Executes transport effects against injected collaborators: synthesizer
/// operations, audio session, and cross-machine notifications.
@MainActor
public final class PlaybackTransportEffectHandler {

    private let speak: (SpeakCommand) -> Void
    private let stopSpeaking: () -> Void
    private let pause: () -> Bool
    private let resume: () -> Bool
    private let activateAudioSession: () -> Void
    private let deactivateAudioSession: () -> Void
    private let notifyFinishedNaturally: () -> Void
    private let notifyStartOver: () -> Void
    private let notifyIdleJump: (SentenceJumpDirection) -> Void

    public init(
        speak: @escaping (SpeakCommand) -> Void,
        stopSpeaking: @escaping () -> Void,
        pause: @escaping () -> Bool,
        resume: @escaping () -> Bool,
        activateAudioSession: @escaping () -> Void,
        deactivateAudioSession: @escaping () -> Void,
        notifyFinishedNaturally: @escaping () -> Void,
        notifyStartOver: @escaping () -> Void,
        notifyIdleJump: @escaping (SentenceJumpDirection) -> Void
    ) {

        self.speak = speak
        self.stopSpeaking = stopSpeaking
        self.pause = pause
        self.resume = resume
        self.activateAudioSession = activateAudioSession
        self.deactivateAudioSession = deactivateAudioSession
        self.notifyFinishedNaturally = notifyFinishedNaturally
        self.notifyStartOver = notifyStartOver
        self.notifyIdleJump = notifyIdleJump
    }

    public func handleEffect(
        _ effect: PlaybackTransportEffect,
        _ dispatch: @escaping @MainActor (PlaybackTransportEvent) -> Void
    ) {

        switch effect {
        case let .beginSpeaking(command, replacingCurrentUtterance):
            beginSpeaking(command, replacingCurrentUtterance: replacingCurrentUtterance)

        case .stopPlayback:
            stopSpeaking()
            deactivateAudioSession()

        case .cancelUtterance:
            stopSpeaking()

        case let .pause(utteranceToken):
            dispatch(.pauseResolved(accepted: pause(), utteranceToken: utteranceToken))

        case let .resume(utteranceToken):
            dispatch(.resumeResolved(accepted: resume(), utteranceToken: utteranceToken))

        case .notifyStartOver:
            notifyStartOver()

        case let .restartPlayback(command):
            notifyStartOver()
            beginSpeaking(command, replacingCurrentUtterance: true)

        case let .notifyIdleJump(direction):
            notifyIdleJump(direction)

        case .finishPlayback:
            deactivateAudioSession()
            notifyFinishedNaturally()

        case .deactivateAudioSession:
            deactivateAudioSession()
        }
    }

    private func beginSpeaking(_ command: SpeakCommand, replacingCurrentUtterance: Bool) {
        if replacingCurrentUtterance {
            stopSpeaking()
        }
        activateAudioSession()
        speak(command)
    }
}
