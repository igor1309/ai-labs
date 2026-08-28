/// Active utterance context: what is being spoken, with which settings, and
/// how far speech has progressed.
public struct PlaybackSession: Equatable, Sendable {
    public var text: String
    public var speed: SpeechSpeed
    public var voiceIdentifier: String?
    public var utteranceToken: Int
    public var utteranceStartUTF16Offset: Int
    public var spokenUTF16Offset: Int
    /// False when the synthesizer utterance was cancelled while paused (jump
    /// repositioning); resume must speak a fresh utterance instead of
    /// continuing.
    public var hasActiveUtterance: Bool
    /// Records a pause tap accepted by the transport while AVFoundation is
    /// still unable to pause the starting utterance.
    public var isPauseRequested: Bool

    public init(
        text: String,
        speed: SpeechSpeed,
        voiceIdentifier: String?,
        utteranceToken: Int,
        utteranceStartUTF16Offset: Int,
        spokenUTF16Offset: Int,
        hasActiveUtterance: Bool,
        isPauseRequested: Bool = false
    ) {

        self.text = text
        self.speed = speed
        self.voiceIdentifier = voiceIdentifier
        self.utteranceToken = utteranceToken
        self.utteranceStartUTF16Offset = utteranceStartUTF16Offset
        self.spokenUTF16Offset = spokenUTF16Offset
        self.hasActiveUtterance = hasActiveUtterance
        self.isPauseRequested = isPauseRequested
    }
}

public enum PlaybackTransportState: Equatable, Sendable {
    /// `lastUtteranceToken` keeps tokens monotonic across idle so terminal
    /// callbacks from a stopped utterance can never match a later session.
    case idle(lastUtteranceToken: Int)
    case speaking(PlaybackSession)
    case paused(PlaybackSession)
}

public extension PlaybackTransportState {

    /// UI projection driving the playback controls.
    var playbackState: PlaybackState {

        switch self {
        case .idle:
            .idle
        case .speaking:
            .speaking
        case .paused:
            .paused
        }
    }

    /// Absolute UTF16 offset into the speech text; nil when idle.
    var spokenUTF16Offset: Int? {

        switch self {
        case .idle:
            nil
        case let .speaking(session), let .paused(session):
            session.spokenUTF16Offset
        }
    }
}

/// User intent to start playback, carrying the derived speech text and the
/// settings selected at the call site.
public struct PlaybackRequest: Equatable, Sendable {
    public let text: String
    public let speed: SpeechSpeed
    public let voiceIdentifier: String?
    public let startUTF16Offset: Int

    public init(text: String, speed: SpeechSpeed, voiceIdentifier: String?, startUTF16Offset: Int) {

        self.text = text
        self.speed = speed
        self.voiceIdentifier = voiceIdentifier
        self.startUTF16Offset = startUTF16Offset
    }
}
