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
    let digitsColor: Color
    let isMonospaced: Bool

    /// `isMonospaced` keeps every digit one width, for an amount that
    /// changes as it is typed; a fixed amount sets it false to keep the
    /// design's proportional width.
    public init(_ digits: String, size: Size, digitsColor: Color = Tokens.text, isMonospaced: Bool = true) {

        self.digits = digits
        self.size = size
        self.digitsColor = digitsColor
        self.isMonospaced = isMonospaced
    }

    public var body: some View {

        HStack(alignment: .center, spacing: gap) {
            MizanSign()
                .fill(Tokens.text)
                .frame(width: signHeight * MizanSign.aspectRatio, height: signHeight)
                .accessibilityHidden(true)
            Text(digits)
                .font(isMonospaced ? font.monospacedDigit() : font)
                .tracking(-2)
                .foregroundStyle(digitsColor)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(digits) Mizan")
    }

    private var font: Font { Tokens.display(fontSize, .semibold) }

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
