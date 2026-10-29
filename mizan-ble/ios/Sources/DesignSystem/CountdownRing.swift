import SwiftUI

/// The seconds left to advertise, in a ring that empties clockwise from the
/// top in the side's colour.
public struct CountdownRing: View {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let secondsText: String
    let caption: String
    let accessibilityText: String
    let remainingFraction: Double
    let side: Side

    public init(secondsLeft: Int, total: Int, side: Side = .host) {

        self.init(
            secondsText: String(max(secondsLeft, 0)), caption: "SECONDS LEFT",
            accessibilityLabel: "\(max(secondsLeft, 0)) seconds left",
            fraction: total > 0 ? Double(secondsLeft) / Double(total) : 0,
            side: side
        )
    }

    /// Renders already formatted copy and a remaining share supplied by a screen.
    public init(
        secondsText: String, caption: String, accessibilityLabel: String,
        fraction: Double, side: Side = .host
    ) {
        self.secondsText = secondsText
        self.caption = caption
        self.accessibilityText = accessibilityLabel
        self.remainingFraction = fraction
        self.side = side
    }

    public var body: some View {

        ZStack {
            Circle()
                .strokeBorder(Tokens.overlay, lineWidth: Self.thickness)
            Circle()
                .inset(by: Self.thickness / 2)
                .trim(from: 0, to: fraction)
                .stroke(side.accent, style: StrokeStyle(lineWidth: Self.thickness))
                .rotationEffect(.degrees(-90))
            VStack(spacing: Tokens.space1) {
                Text(secondsText)
                    .font(Tokens.display(Tokens.sizeRing, .semibold))
                    .tracking(-2)
                    .foregroundStyle(Tokens.text)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(Motion.fast(reduced: reduceMotion).animation, value: secondsText)
                Text(caption)
                    .font(Tokens.mono(Tokens.sizeEyebrow, .regular))
                    .tracking(1.5)
                    .foregroundStyle(Tokens.text2)
            }
        }
        .frame(width: Self.diameter, height: Self.diameter)
        .animation(Motion.tick(reduced: reduceMotion)?.animation, value: fraction)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    /// The share of the ring still drawn.
    var fraction: CGFloat {

        min(max(CGFloat(remainingFraction), 0), 1)
    }

    static let diameter: CGFloat = 240
    static let thickness: CGFloat = 9.6
}
