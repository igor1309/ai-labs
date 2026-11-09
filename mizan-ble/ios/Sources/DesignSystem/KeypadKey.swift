import SwiftUI

/// A keypad digit or SF Symbol with the design's touch target.
public struct KeypadKey: View {
    public enum Size: CaseIterable, Sendable {
        case regular, compact
    }

    private enum Content {
        case digit(String)
        case icon(String, label: String)
    }

    private let content: Content
    private let action: () -> Void
    private let size: Size

    public init(_ digit: String, size: Size = .regular, action: @escaping () -> Void) {
        self.content = .digit(digit)
        self.size = size
        self.action = action
    }

    public init(systemImage: String, accessibilityLabel: String, size: Size = .regular, action: @escaping () -> Void) {
        self.content = .icon(systemImage, label: accessibilityLabel)
        self.size = size
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Group {
                switch content {
                case .digit(let digit):
                    Text(digit).typeRole(.keypad)
                case .icon(let symbol, let label):
                    Image(systemName: symbol).font(.system(size: 34)).foregroundStyle(Tokens.text2)
                        .frame(width: 34, height: 34).accessibilityLabel(label)
                }
            }
            .frame(width: size == .regular ? 96 : nil, height: size == .regular ? 88 : Tokens.space12)
            .frame(maxWidth: size == .compact ? .infinity : nil)
            .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusMd))
        }
        .buttonStyle(KeyStyle())
        // UI tests find a key by this, not by its text, which other views
        // on the screen may also show.
        .accessibilityIdentifier(identifier)
    }
}

private extension KeypadKey {
    var identifier: String {
        switch content {
        case .digit(let digit): "key \(digit)"
        case .icon(_, let label): "key \(label)"
        }
    }
}

private struct KeyStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Tokens.overlay : .clear,
                        in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
    }
}
