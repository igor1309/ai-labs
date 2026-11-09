import SwiftUI

public struct SignalMeter: View {
    public enum Tone: CaseIterable, Equatable, Sendable { case live, atStart, none }

    public struct Model: Equatable, Sendable {
        public var label: String
        public var bars: Int
        public var tone: Tone

        public init(label: String, bars: Int, tone: Tone) {
            self.label = label
            self.bars = bars
            self.tone = tone
        }

        public static let noSignal = Model(label: "No signal", bars: 0, tone: .none)
    }

    private let model: Model

    public init(_ model: Model) {
        self.model = model
    }

    public var body: some View {
        HStack(spacing: Tokens.space2) {
            HStack(alignment: .bottom, spacing: Tokens.space1) {
                ForEach(0..<4) { index in
                    RoundedRectangle(cornerRadius: Tokens.space1 / 2)
                        .fill(index < bars ? litColor : Tokens.raised2)
                        .frame(width: Tokens.space1, height: Tokens.space1 * CGFloat(index + 1))
                }
            }
            Text(model.label)
                .font(Tokens.mono(Tokens.sizeSmall, .medium))
                .foregroundStyle(Tokens.text2)
                .lineLimit(1)
        }
        .fixedSize()
        .fadesIn(on: model.label)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.label)
        .accessibilityValue("\(bars) of 4 bars")
    }

    private var bars: Int { min(4, max(0, model.bars)) }

    private var litColor: Color {
        switch model.tone {
        case .live: Tokens.client
        case .atStart: Tokens.text2
        case .none: Tokens.raised2
        }
    }
}
