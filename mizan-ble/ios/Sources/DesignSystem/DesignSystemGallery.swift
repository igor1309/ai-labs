import SwiftUI

/// Every component on the design's ground, laid out like the design file's
/// "Mizan · Design System" frame, to compare the two by eye.
public struct DesignSystemGallery: View {

    public init() {}

    public var body: some View {

        VStack(alignment: .leading, spacing: Tokens.space12) {
            section("SIGN & AMOUNT") {
                HStack(alignment: .center, spacing: Tokens.space12) {
                    MizanSign().fill(Tokens.text).frame(width: 72.63, height: 138.25)
                    ForEach(AmountView.Size.allCases, id: \.self) { AmountView("124.50", size: $0) }
                }
            }
            section("MODE HEADER") {
                HStack(alignment: .top, spacing: Tokens.space12) {
                    ModeHeader(side: .host, layout: .rail) { _ in }
                    ModeHeader(side: .client, layout: .bar) { _ in }.frame(width: 353)
                }
            }
            section("BUTTONS") {
                Grid(horizontalSpacing: Tokens.space4, verticalSpacing: Tokens.space4) {
                    GridRow {
                        button("Lock & broadcast", "lock", .host)
                        button("Start handshake", "antenna.radiowaves.left.and.right", .client)
                        button("Success", "checkmark.circle", .success)
                    }
                    GridRow {
                        button("Failure", "xmark.circle", .failure)
                        button("Decline", "xmark", .decline)
                        button("Cancel", "xmark", .secondary)
                    }
                }
                .frame(width: 932)
            }
            section("COUNTDOWN & RESULT") {
                HStack(alignment: .center, spacing: Tokens.space12) {
                    CountdownRing(secondsLeft: 47, total: 60, side: .host)
                    VStack(spacing: Tokens.space4) {
                        HStack(spacing: Tokens.space4) {
                            ForEach(Outcome.allCases, id: \.self) { ResultMark($0) }
                        }
                    }
                    ResultCard(.success, title: "Payment approved") {
                        button("New amount", "plus", .host)
                    }
                    .frame(width: 320)
                }
            }
        }
        .padding(Tokens.space18)
        .background(Tokens.ground)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {

        VStack(alignment: .leading, spacing: Tokens.space6) {
            Text(title)
                .font(Tokens.mono(Tokens.sizeEyebrow, .medium))
                .tracking(1.5)
                .foregroundStyle(Tokens.text3)
            content()
        }
    }

    private func button(_ title: String, _ symbol: String, _ kind: ActionButtonStyle.Kind) -> some View {

        Button {} label: { Label(title, systemImage: symbol) }
            .buttonStyle(.action(kind))
            .frame(width: 300)
    }
}

#Preview(traits: .sizeThatFitsLayout) {
    DesignSystemGallery()
}
