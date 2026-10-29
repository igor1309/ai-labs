import SwiftUI

/// How a transaction ended, as each side shows it.
public enum Outcome: CaseIterable, Sendable {

    case success
    case failure
    case declined
    case linkLost
    case timeout

    var symbol: String {

        switch self {
        case .success: "checkmark"
        case .failure: "xmark"
        case .declined: "nosign"
        case .linkLost: "antenna.radiowaves.left.and.right.slash"
        case .timeout: "clock.badge.xmark"
        }
    }

    var color: Color {

        switch self {
        case .success: Tokens.ok
        case .failure, .linkLost: Tokens.bad
        case .declined: Tokens.text2
        case .timeout: Tokens.host
        }
    }

    var tint: Color {

        switch self {
        case .success: Tokens.okTint
        case .failure, .linkLost: Tokens.badTint
        case .declined: Tokens.overlay
        case .timeout: Tokens.hostTint
        }
    }
}

/// The outcome's mark: its symbol in a tinted disc.
public struct ResultMark: View {

    let outcome: Outcome

    public init(_ outcome: Outcome) {

        self.outcome = outcome
    }

    public var body: some View {

        Group {
            if outcome == .linkLost {
                BluetoothSymbol(isSlashed: true)
                    .frame(width: Tokens.space12, height: Tokens.space12)
            } else {
                Image(systemName: outcome.symbol)
                    .font(.system(size: 44, weight: .semibold))
            }
        }
        .foregroundStyle(outcome.color)
        .frame(width: Self.diameter, height: Self.diameter)
        .background(outcome.tint, in: Circle())
        .accessibilityHidden(true)
    }

    static let diameter: CGFloat = 112
}

/// The card that ends a transaction: the outcome's mark, a title, and the
/// actions that follow, such as starting a new amount.
public struct ResultCard<Actions: View>: View {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let outcome: Outcome
    let title: String
    let actions: Actions

    public init(_ outcome: Outcome, title: String, @ViewBuilder actions: () -> Actions) {

        self.outcome = outcome
        self.title = title
        self.actions = actions()
    }

    public var body: some View {

        VStack(spacing: Tokens.space5) {
            ResultMark(outcome)
            Text(title)
                .font(Tokens.text(Tokens.sizeLead, .semibold))
                .foregroundStyle(Tokens.text)
                .multilineTextAlignment(.center)
            actions
        }
        .padding(Tokens.space7)
        .frame(maxWidth: .infinity)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
        .animation(Motion.fast(reduced: reduceMotion).animation, value: title)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: outcome)
    }
}

public extension ResultCard where Actions == EmptyView {

    init(_ outcome: Outcome, title: String) {

        self.init(outcome, title: title) { EmptyView() }
    }
}
