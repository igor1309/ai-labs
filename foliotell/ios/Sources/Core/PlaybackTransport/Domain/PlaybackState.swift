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
            "play.fill"
        case .speaking:
            "pause.fill"
        }
    }

    var isStopEnabled: Bool {
        self != .idle
    }
}
