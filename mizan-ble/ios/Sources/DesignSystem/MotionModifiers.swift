import SwiftUI

public extension Motion {

    /// The named animations, each resolved against Reduce Motion where applied.
    enum Kind: Sendable {
        case fast, standard, panel

        public func spec(reduced: Bool) -> Spec {
            switch self {
            case .fast: Motion.fast(reduced: reduced)
            case .standard: Motion.standard(reduced: reduced)
            case .panel: Motion.panel(reduced: reduced)
            }
        }
    }
}

public extension View {

    /// Animates changes to `value` with the named motion, honouring Reduce Motion.
    func motion<V: Equatable>(_ kind: Motion.Kind, value: V) -> some View {
        modifier(MotionModifier(kind: kind, value: value))
    }
}

struct MotionModifier<V: Equatable>: ViewModifier {

    let kind: Motion.Kind
    let value: V

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(kind.spec(reduced: reduceMotion).animation, value: value)
    }
}
