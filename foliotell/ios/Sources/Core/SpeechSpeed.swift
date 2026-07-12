import Foundation

public enum SpeechSpeed: String, CaseIterable, Equatable, Identifiable, Sendable {
    case one = "1x"
    case oneAndQuarter = "1.25x"
    case oneAndHalf = "1.5x"
    case oneAndThreeQuarters = "1.75x"
    case two = "2x"

    public var id: String { rawValue }

    public var utteranceRate: Float {

        switch self {
        case .one:
            0.45
        case .oneAndQuarter:
            0.52
        case .oneAndHalf:
            0.59
        case .oneAndThreeQuarters:
            0.66
        case .two:
            0.73
        }
    }

    public static func speed(for rawValue: String) -> Self {

        Self(rawValue: rawValue) ?? .one
    }
}
