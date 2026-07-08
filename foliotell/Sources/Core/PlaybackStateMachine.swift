public enum PlaybackState: Equatable, Sendable {
    case idle
    case paused
    case speaking
}

public extension PlaybackState {

    var primaryControlTitle: String {
        switch self {
        case .idle:
            "Play"
        case .paused:
            "Resume"
        case .speaking:
            "Pause"
        }
    }

    var primaryControlSystemImage: String {
        switch self {
        case .idle:
            "play.fill"
        case .paused:
            "playpause.fill"
        case .speaking:
            "pause.fill"
        }
    }

    var isStopEnabled: Bool {
        self != .idle
    }
}

public struct PlaybackStateMachine: Equatable, Sendable {
    public private(set) var currentSpeed: SpeechSpeed
    public private(set) var currentText: String
    public private(set) var currentUtteranceStartUTF16Offset: Int
    public private(set) var currentSpokenUTF16Offset: Int
    public private(set) var playbackState: PlaybackState

    private var isReplacingUtterance: Bool

    public init(
        currentSpeed: SpeechSpeed = .one,
        currentText: String = "",
        currentUtteranceStartUTF16Offset: Int = 0,
        currentSpokenUTF16Offset: Int = 0,
        playbackState: PlaybackState = .idle
    ) {

        self.currentSpeed = currentSpeed
        self.currentText = currentText
        self.currentUtteranceStartUTF16Offset = currentUtteranceStartUTF16Offset
        self.currentSpokenUTF16Offset = currentSpokenUTF16Offset
        self.playbackState = playbackState
        isReplacingUtterance = false
    }

    public mutating func startSpeaking(
        text: String,
        speed: SpeechSpeed,
        isReplacingUtterance: Bool,
        startingAtUTF16Offset: Int = 0
    ) {
        currentText = text
        currentSpeed = speed
        currentUtteranceStartUTF16Offset = boundedUTF16Offset(startingAtUTF16Offset)
        currentSpokenUTF16Offset = currentUtteranceStartUTF16Offset
        playbackState = .speaking
        self.isReplacingUtterance = isReplacingUtterance
    }

    public mutating func willSpeakRange(startingAtUTF16Offset: Int) {
        currentSpokenUTF16Offset = boundedUTF16Offset(currentUtteranceStartUTF16Offset + startingAtUTF16Offset)
    }

    public var remainingTextFromCurrentSpeechBoundary: String {
        let offset = boundedUTF16Offset(currentSpokenUTF16Offset)
        let utf16Index = currentText.utf16.index(currentText.utf16.startIndex, offsetBy: offset)
        guard let index = String.Index(utf16Index, within: currentText) else {
            return currentText
        }

        return String(currentText[index...])
    }

    /// Moves the tracked position without changing the playback state.
    public mutating func reposition(toUTF16Offset utf16Offset: Int) {
        currentUtteranceStartUTF16Offset = boundedUTF16Offset(utf16Offset)
        currentSpokenUTF16Offset = currentUtteranceStartUTF16Offset
    }

    public mutating func pauseSucceeded() {
        playbackState = .paused
    }

    public mutating func resumeSucceeded() {
        playbackState = .speaking
    }

    public mutating func stopRequested() {
        isReplacingUtterance = false
        playbackState = .idle
    }

    public mutating func speechFinished() {
        isReplacingUtterance = false
        playbackState = .idle
    }

    public mutating func speechCancelled() {
        if isReplacingUtterance {
            isReplacingUtterance = false
            playbackState = .speaking
        } else {
            playbackState = .idle
        }
    }

    public mutating func applySpeed(_ speed: SpeechSpeed) -> Bool {
        guard speed != currentSpeed else {
            return false
        }

        currentSpeed = speed
        return playbackState != .idle
    }

    private func boundedUTF16Offset(_ offset: Int) -> Int {
        min(max(offset, 0), currentText.utf16.count)
    }
}
