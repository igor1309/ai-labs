import SwiftUI

/// The seconds left to advertise, in a ring that empties clockwise from the
/// top in the side's colour.
public struct CountdownRing: View {

    let secondsLeft: Int
    let total: Int
    let side: Side

    public init(secondsLeft: Int, total: Int, side: Side = .host) {

        self.secondsLeft = secondsLeft
        self.total = total
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
                Text("\(max(secondsLeft, 0))")
                    .font(Tokens.display(Tokens.sizeRing, .semibold))
                    .tracking(-2)
                    .foregroundStyle(Tokens.text)
                    .monospacedDigit()
                Text("SECONDS LEFT")
                    .font(Tokens.mono(Tokens.sizeEyebrow, .regular))
                    .tracking(1.5)
                    .foregroundStyle(Tokens.text2)
            }
        }
        .frame(width: Self.diameter, height: Self.diameter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(max(secondsLeft, 0)) seconds left")
    }

    /// The share of the ring still drawn.
    var fraction: CGFloat {

        guard total > 0 else { return 0 }
        return min(max(CGFloat(secondsLeft) / CGFloat(total), 0), 1)
    }

    static let diameter: CGFloat = 240
    static let thickness: CGFloat = 9.6
}
