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

    /// Shows the new `value` at once, in its new size and place, and fades it
    /// in. An animation around it would crossfade the old and new text over
    /// each other, or stretch one frame while the text inside it has moved,
    /// so no animation reaches this view's change. Put it on the whole element
    /// whose size follows the text, such as a pill, so all of it moves at once.
    func fadesIn<V: Equatable>(on value: V) -> some View {
        modifier(FadeInModifier(value: value))
    }
}

struct FadeInModifier<V: Equatable>: ViewModifier {

    let value: V

    func body(content: Content) -> some View {
        content
            // Also stops animations set further in, such as a number's own.
            .transaction(value: value) { transaction in
                transaction.animation = nil
                transaction.disablesAnimations = true
            }
            .keyframeAnimator(initialValue: 1.0, trigger: value) { view, opacity in
                view.opacity(opacity)
            } keyframes: { _ in
                MoveKeyframe(0)
                CubicKeyframe(1, duration: Motion.textIn.duration)
            }
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
