import SwiftUI

public enum Motion {
    public struct Spec: Equatable, Sendable {
        public let duration: Double
        public let curve: Curve
        public var delay: Double = 0

        public enum Curve: Equatable, Sendable { case linear, easeOut, easeInOut, spring }
        public var animation: Animation {
            let animation: Animation = switch curve {
            case .linear: .linear(duration: duration)
            case .easeOut: .easeOut(duration: duration)
            case .easeInOut: .easeInOut(duration: duration)
            case .spring: .spring(duration: duration, bounce: 0.12)
            }
            return delay > 0 ? animation.delay(delay) : animation
        }
    }

    public static let crossfade = Spec(duration: 0.15, curve: .easeOut)
    public static func fast(reduced: Bool) -> Spec { reduced ? crossfade : Spec(duration: 0.15, curve: .easeOut) }
    public static func standard(reduced: Bool) -> Spec { reduced ? crossfade : Spec(duration: 0.25, curve: .easeInOut) }
    public static func panel(reduced: Bool) -> Spec { reduced ? crossfade : Spec(duration: 0.35, curve: .spring) }
    public static func tick(reduced: Bool) -> Spec? { reduced ? nil : Spec(duration: 1, curve: .linear) }
    /// What leaves fades out first, then what comes fades in, so the two
    /// never draw over each other.
    public static let fadeOut = Spec(duration: 0.1, curve: .easeOut)
    public static let fadeIn = Spec(duration: 0.18, curve: .easeOut, delay: 0.1)
    public static var fadeThrough: AnyTransition {
        .asymmetric(insertion: .opacity.animation(fadeIn.animation), removal: .opacity.animation(fadeOut.animation))
    }
    public static let textIn = Spec(duration: 0.2, curve: .easeOut)
    public static func panelTransition(reduced: Bool) -> AnyTransition {
        reduced ? fadeThrough : .asymmetric(
            insertion: .opacity.combined(with: .scale(scale: 0.96)).animation(fadeIn.animation),
            removal: .opacity.animation(fadeOut.animation)
        )
    }
    public static func itemTransition(reduced: Bool, from edge: Edge) -> AnyTransition {
        reduced ? .opacity : .opacity.combined(with: .move(edge: edge))
    }
}
