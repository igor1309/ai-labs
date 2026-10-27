import SwiftUI

/// A keypad digit or SF Symbol with the design's touch target.
public struct KeypadKey: View {
    private enum Content {
        case digit(String)
        case icon(String, label: String)
    }

    private let content: Content
    private let action: () -> Void

    public init(_ digit: String, action: @escaping () -> Void) {
        self.content = .digit(digit)
        self.action = action
    }

    public init(systemImage: String, accessibilityLabel: String, action: @escaping () -> Void) {
        self.content = .icon(systemImage, label: accessibilityLabel)
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
            .frame(width: 96, height: 88)
            .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusMd))
        }
        .buttonStyle(KeyStyle())
    }
}

private struct KeyStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Tokens.overlay : .clear,
                        in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
    }
}
