import SwiftUI

/// An amount in Mizan: the sign, then the digits. The caller formats the
/// digits; the view only sets them.
public struct AmountView: View {

    public enum Size: CaseIterable, Sendable {

        /// The iPad's amount.
        case xl
        /// The iPhone's amount.
        case l
        /// Amounts inside panels and cards.
        case m
    }

    let digits: String
    let size: Size

    public init(_ digits: String, size: Size) {

        self.digits = digits
        self.size = size
    }

    public var body: some View {

        HStack(alignment: .center, spacing: gap) {
            MizanSign()
                .fill(Tokens.text)
                .frame(width: signHeight * MizanSign.aspectRatio, height: signHeight)
                .accessibilityHidden(true)
            Text(digits)
                .font(Tokens.display(fontSize, .semibold))
                .tracking(-2)
                .foregroundStyle(Tokens.text)
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(digits) Mizan")
    }

    private var fontSize: CGFloat {

        switch size {
        case .xl: Tokens.sizeAmountXl
        case .l: Tokens.sizeAmountL
        case .m: Tokens.sizeAmountM
        }
    }

    private var gap: CGFloat {

        switch size {
        case .xl: Tokens.space5
        case .l: Tokens.space4
        case .m: Tokens.space3
        }
    }

    /// The sign's height beside digits of each size, as the design draws it.
    private var signHeight: CGFloat {

        switch size {
        case .xl: 138.25
        case .l: 104.67
        case .m: 71.1
        }
    }
}
