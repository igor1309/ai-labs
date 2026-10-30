import SwiftUI

public struct StatusPill: View {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public enum State: CaseIterable, Sendable {
        case idle, host, client, ok, bad

        public var color: Color {
            switch self {
            case .idle: Tokens.text2
            case .host: Tokens.host
            case .client: Tokens.client
            case .ok: Tokens.ok
            case .bad: Tokens.bad
            }
        }

        var border: Color { self == .idle ? Tokens.lineStrong : color }
    }

    let title: String
    let state: State

    public init(_ title: String, state: State = .idle) {
        self.title = title
        self.state = state
    }

    public var body: some View {
        HStack(spacing: Tokens.space2) {
            Circle().fill(state.color).frame(width: Tokens.space2, height: Tokens.space2)
            Text(title).font(Tokens.mono(Tokens.sizeSmall, .medium)).foregroundStyle(state.color)
        }
        .padding(.vertical, Tokens.space2)
        .padding(.horizontal, Tokens.space3)
        .overlay { Capsule().strokeBorder(state.border, lineWidth: 1) }
        .fixedSize()
        .fadesIn(on: title)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: state)
        .accessibilityElement(children: .combine)
    }
}
