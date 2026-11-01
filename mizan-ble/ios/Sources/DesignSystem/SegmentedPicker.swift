import SwiftUI

/// One choice out of a few, as segments on a rail.
public struct SegmentedPicker<Value: Hashable>: View {

    public struct Option {
        public let value: Value
        public let title: String

        public init(_ value: Value, title: String) {
            self.value = value
            self.title = title
        }
    }

    let options: [Option]
    let selection: Value
    let side: Side
    let onSelect: (Value) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ options: [Option], selection: Value, side: Side = .host, onSelect: @escaping (Value) -> Void) {

        self.options = options
        self.selection = selection
        self.side = side
        self.onSelect = onSelect
    }

    public var body: some View {

        HStack(spacing: Tokens.space1) {
            ForEach(options, id: \.value) { segment($0) }
        }
        .padding(Tokens.space1)
        .background(Tokens.rail, in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
        .animation(Motion.fast(reduced: reduceMotion).animation, value: selection)
    }

    private func segment(_ option: Option) -> some View {

        let selected = option.value == selection
        return Button { onSelect(option.value) } label: {
            Text(option.title)
                .typeRole(selected ? .labelS : .body)
                .foregroundStyle(selected ? Tokens.onAccent : Tokens.text2)
                .frame(maxWidth: .infinity)
                .frame(height: Tokens.space12)
                .background {
                    if selected {
                        RoundedRectangle(cornerRadius: Tokens.radiusSm).fill(side == .host ? Tokens.host : Tokens.client)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusSm))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
