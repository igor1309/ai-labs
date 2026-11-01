import SwiftUI

/// The design's buttons: 60 tall, an icon and a label. Give the button a
/// `Label` with an SF Symbol; the style sizes and colours both.
///
///     Button(action: lock) { Label("Lock & broadcast", systemImage: "lock") }
///         .buttonStyle(.action(.host))
public struct ActionButtonStyle: ButtonStyle {

    public enum Kind: CaseIterable, Sendable {

        /// The host's main action.
        case host
        /// The client's main action.
        case client
        /// Reports the mocked payment as approved.
        case success
        /// Reports the mocked payment as failed.
        case failure
        /// The client turns the payment down.
        case decline
        /// Cancel, Done and other ways out.
        case secondary
    }

    let kind: Kind

    public init(_ kind: Kind) {

        self.kind = kind
    }

    public func makeBody(configuration: Configuration) -> some View {

        configuration.label
            .labelStyle(ActionLabelStyle())
            .font(Tokens.text(Tokens.sizeBody, .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, Tokens.space6)
            .frame(maxWidth: .infinity, minHeight: Self.height)
            .background(fill, in: shape)
            .overlay {
                if kind == .secondary { shape.strokeBorder(Tokens.lineStrong, lineWidth: 1.5) }
            }
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }

    static let height: CGFloat = 60

    private var shape: RoundedRectangle {

        RoundedRectangle(cornerRadius: Tokens.radiusLg)
    }

    private var fill: Color {

        switch kind {
        case .host: Tokens.host
        case .client: Tokens.client
        case .success: Tokens.ok
        case .failure: Tokens.bad
        case .decline: Tokens.badTint
        case .secondary: .clear
        }
    }

    private var foreground: Color {

        switch kind {
        case .host, .client, .success, .failure: Tokens.onAccent
        case .decline: Tokens.bad
        case .secondary: Tokens.text
        }
    }
}

public extension ButtonStyle where Self == ActionButtonStyle {

    static func action(_ kind: ActionButtonStyle.Kind) -> ActionButtonStyle {

        ActionButtonStyle(kind)
    }
}

private struct ActionLabelStyle: LabelStyle {

    func makeBody(configuration: Configuration) -> some View {

        HStack(spacing: Tokens.space3) {
            configuration.icon
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 20, height: 20)
            configuration.title
        }
    }
}
