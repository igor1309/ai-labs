import SwiftUI

/// The header every screen opens with: the Mizan wordmark, a BLE tag in the
/// side's colour, and the mode switch.
public struct ModeHeader: View {

    public enum Layout: Sendable {

        /// The iPad's session rail: the wordmark above the switch.
        case rail
        /// The iPhone's top row: the wordmark at the start, the switch at the end.
        case bar
    }

    let side: Side
    let layout: Layout
    let onSwitch: (Side) -> Void

    public init(side: Side, layout: Layout, onSwitch: @escaping (Side) -> Void) {

        self.side = side
        self.layout = layout
        self.onSwitch = onSwitch
    }

    public var body: some View {

        switch layout {
        case .rail:
            VStack(alignment: .leading, spacing: Tokens.space5) {
                wordmark
                ModeSwitch(selection: side, onSelect: onSwitch)
            }
        case .bar:
            HStack {
                wordmark
                Spacer(minLength: Tokens.space3)
                ModeSwitch(selection: side, onSelect: onSwitch)
            }
        }
    }

    private var wordmark: some View {

        HStack(spacing: layout == .rail ? Tokens.space3 : Tokens.space2) {
            Text("Mizan")
                .font(Tokens.display(layout == .rail ? Tokens.sizeWordmark : Tokens.sizeLead, .bold))
                .foregroundStyle(Tokens.text)
            Text("BLE")
                .font(Tokens.text(layout == .rail ? Tokens.sizeEyebrow : Tokens.sizeMicro, .bold))
                .foregroundStyle(Tokens.onAccent)
                .padding(.vertical, Tokens.space1)
                .padding(.horizontal, Tokens.space2)
                .background(side.accent, in: RoundedRectangle(cornerRadius: Tokens.radiusSm))
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}

/// Host and Client, side by side; the selected one fills with its colour.
public struct ModeSwitch: View {

    let selection: Side
    let onSelect: (Side) -> Void

    public init(selection: Side, onSelect: @escaping (Side) -> Void) {

        self.selection = selection
        self.onSelect = onSelect
    }

    public var body: some View {

        HStack(spacing: Tokens.space1) {
            ForEach(Side.allCases, id: \.self) { side in
                segment(side)
            }
        }
        .padding(Tokens.space1)
        .background(Tokens.overlay, in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
        .fixedSize()
    }

    private func segment(_ side: Side) -> some View {

        let selected = side == selection

        return Button { onSelect(side) } label: {
            HStack(spacing: Tokens.space2) {
                Image(systemName: side.symbol)
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 16, height: 16)
                Text(side.title)
                    .font(Tokens.text(Tokens.sizeSmall, .semibold))
            }
            .foregroundStyle(selected ? Tokens.onAccent : Tokens.text3)
            .padding(.vertical, Tokens.space2)
            .padding(.horizontal, Tokens.space3)
            .background(selected ? side.accent : .clear, in: RoundedRectangle(cornerRadius: Tokens.radiusSm))
            .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusSm))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
