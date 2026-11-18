import SwiftUI

/// The track every segmented choice draws: a raised thumb under the selected
/// segment. Keyboard focus draws nothing: no ring, no outline. Pair it with
/// `SegmentsTarget`, which takes input.
public struct SegmentTrack<Label: View>: View {

    let count: Int
    let selected: Int?
    let fill: Bool
    let tokens: GlassLedger
    let label: (Int, Bool) -> Label

    /// `label` draws segment `index`; its `Bool` says whether it is selected.
    public init(count: Int, selected: Int?, fill: Bool = true, tokens: GlassLedger,
                @ViewBuilder label: @escaping (Int, Bool) -> Label) {
        self.count = count; self.selected = selected; self.fill = fill
        self.tokens = tokens; self.label = label
    }

    public var body: some View {
        HStack(spacing: tokens.space2) {
            ForEach(0..<count, id: \.self) { index in
                let isSelected = index == selected
                label(index, isSelected)
                    .lineLimit(1)
                    .padding(.vertical, tokens.space2)
                    .padding(.horizontal, tokens.space12)
                    .frame(maxWidth: fill ? .infinity : nil)
                    .background {
                        if isSelected {
                            RoundedRectangle(cornerRadius: tokens.radiusThumb)
                                .fill(tokens.segThumb)
                                .shadow(color: tokens.segShadow, radius: 1, y: 1)
                        }
                    }
            }
        }
        .padding(tokens.space2)
        .background(tokens.segTrack, in: .rect(cornerRadius: tokens.radiusControl))
        .accessibilityHidden(true)
    }
}
