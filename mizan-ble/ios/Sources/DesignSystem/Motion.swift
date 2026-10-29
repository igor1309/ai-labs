import SwiftUI

public enum Motion {
    public struct Spec: Equatable, Sendable {
        public let duration: Double
        public let curve: Curve

        public enum Curve: Equatable, Sendable { case linear, easeOut, easeInOut, spring }
        public var animation: Animation {
            switch curve {
            case .linear: .linear(duration: duration)
            case .easeOut: .easeOut(duration: duration)
            case .easeInOut: .easeInOut(duration: duration)
            case .spring: .spring(duration: duration, bounce: 0.12)
            }
        }
    }

    public static let crossfade = Spec(duration: 0.15, curve: .easeOut)
    public static func fast(reduced: Bool) -> Spec { reduced ? crossfade : Spec(duration: 0.15, curve: .easeOut) }
    public static func standard(reduced: Bool) -> Spec { reduced ? crossfade : Spec(duration: 0.25, curve: .easeInOut) }
    public static func panel(reduced: Bool) -> Spec { reduced ? crossfade : Spec(duration: 0.35, curve: .spring) }
    public static func tick(reduced: Bool) -> Spec? { reduced ? nil : Spec(duration: 1, curve: .linear) }
    public static func panelTransition(reduced: Bool) -> AnyTransition {
        reduced ? .opacity : .opacity.combined(with: .scale(scale: 0.96))
    }
    public static func itemTransition(reduced: Bool, from edge: Edge) -> AnyTransition {
        reduced ? .opacity : .opacity.combined(with: .move(edge: edge))
    }
}
