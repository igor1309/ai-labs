/// Instruction to the synthesizer adapter: speak `text` as one utterance
/// identified by `utteranceToken`.
public struct SpeakCommand: Equatable, Sendable {
    public let utteranceToken: Int
    public let text: String
    public let speed: SpeechSpeed
    public let voiceIdentifier: String?
    /// Language for automatic voice resolution when no explicit voice is set.
    public let languageCode: String?

    public init(
        utteranceToken: Int,
        text: String,
        speed: SpeechSpeed,
        voiceIdentifier: String?,
        languageCode: String?
    ) {

        self.utteranceToken = utteranceToken
        self.text = text
        self.speed = speed
        self.voiceIdentifier = voiceIdentifier
        self.languageCode = languageCode
    }
}

public enum SentenceJumpDirection: Equatable, Sendable {
    case previous
    case next
}

public enum PlaybackTransportEffect: Equatable, Sendable {
    case beginSpeaking(SpeakCommand, replacingCurrentUtterance: Bool)
    /// Stop the synthesizer and release the audio session.
    case stopPlayback
    /// Tokens scope the eventual resolution to the utterance that requested
    /// it, so an interleaved replacement cannot be paused/resumed by mistake.
    case pause(utteranceToken: Int)
    case resume(utteranceToken: Int)
    /// Cancel the pending synthesizer utterance while staying paused; the
    /// audio session stays active for the eventual resume.
    case cancelUtterance
    /// Clear the persisted position without touching playback.
    case notifyStartOver
    /// Forward a sentence jump made while idle to the position owner.
    case notifyIdleJump(SentenceJumpDirection)
    /// Release the audio session and notify that speech ran off the end of
    /// the document.
    case finishPlayback
    case deactivateAudioSession
    /// Clear the persisted position and speak from the beginning, replacing
    /// the current utterance.
    case restartPlayback(SpeakCommand)
}
