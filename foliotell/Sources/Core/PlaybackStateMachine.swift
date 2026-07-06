public enum PlaybackState: Equatable, Sendable {
    case idle
    case paused
    case speaking
}

public extension PlaybackState {

    var isStartEnabled: Bool {
        self == .idle
    }

    var isPauseResumeEnabled: Bool {
        self != .idle
    }

    var isStopEnabled: Bool {
        self != .idle
    }
}

public struct PlaybackStateMachine: Equatable, Sendable {
    public private(set) var currentSpeed: SpeechSpeed
    public private(set) var currentText: String
    public private(set) var playbackState: PlaybackState

    private var isReplacingUtterance: Bool

    public init(
        currentSpeed: SpeechSpeed = .one,
        currentText: String = "",
        playbackState: PlaybackState = .idle
    ) {

        self.currentSpeed = currentSpeed
        self.currentText = currentText
        self.playbackState = playbackState
        isReplacingUtterance = false
    }

    public mutating func startSpeaking(text: String, speed: SpeechSpeed, isReplacingUtterance: Bool) {
        currentText = text
        currentSpeed = speed
        playbackState = .speaking
        self.isReplacingUtterance = isReplacingUtterance
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
}
