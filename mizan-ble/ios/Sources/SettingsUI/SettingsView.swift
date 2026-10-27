import DesignSystem
import SwiftUI

public struct SettingsView: View {
    private let state: SettingsState
    private let event: (SettingsEvent) -> Void

    public init(state: SettingsState, event: @escaping (SettingsEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        IPadShell(
            eyebrow: state.eyebrow, status: StatusPill(state.statusText),
            deviceCode: state.deviceCode, deviceMeta: state.deviceMeta,
            onSwitch: { _ in }, onSettings: {}
        ) {
            HostRail(state.steps)
        } content: {
            HStack(alignment: .top, spacing: Tokens.space12) {
                VStack(alignment: .leading, spacing: Tokens.space6) {
                    Text(state.title).typeRole(.title)
                    countdownCard
                    readOnlyCard
                    Spacer(minLength: .zero)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ringPanel
            }
        }
    }

    private var countdownCard: some View {
        VStack(alignment: .leading, spacing: Tokens.space5) {
            ZStack(alignment: .trailing) {
                VStack(alignment: .leading, spacing: Tokens.space1) {
                    Text(state.countdown.title).typeRole(.lead).foregroundStyle(Tokens.text)
                    Text(state.countdown.detail)
                        .font(Tokens.text(Tokens.sizeLabel))
                        .foregroundStyle(Tokens.text2)
                        .fixedSize(horizontal: true, vertical: false)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(state.countdown.selectedText).typeRole(.title).foregroundStyle(Tokens.hostHi)
            }
            HStack(spacing: Tokens.space1) {
                ForEach(state.countdown.choices.indices, id: \.self) { index in
                    countdownChoice(state.countdown.choices[index])
                }
            }
            .padding(Tokens.space1)
            .background(Tokens.rail, in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
        }
        .padding(Tokens.space7)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }

    private func countdownChoice(_ choice: SettingsState.CountdownChoice) -> some View {
        let selected = choice.seconds == state.countdown.selectedSeconds

        return Button { event(.chooseCountdown(choice.seconds)) } label: {
            Text(choice.text)
                .font(Tokens.text(Tokens.sizeLabel, selected ? .semibold : .regular))
                .foregroundStyle(selected ? Tokens.onAccent : Tokens.text2)
                .frame(maxWidth: .infinity)
                .frame(height: Tokens.space12)
                .background {
                    if selected {
                        RoundedRectangle(cornerRadius: Tokens.radiusSm).fill(Tokens.host)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusSm))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var readOnlyCard: some View {
        VStack(spacing: Tokens.space5) {
            ForEach(state.readOnlyRows.indices, id: \.self) { index in
                if index != state.readOnlyRows.startIndex {
                    Divider().hidden().overlay(Tokens.line)
                }
                let row = state.readOnlyRows[index]
                HStack(spacing: Tokens.space3) {
                    Text(row.title).typeRole(.body)
                    Spacer(minLength: .zero)
                    Text(row.value)
                        .font(Tokens.mono(Tokens.sizeLabel, .regular))
                        .foregroundStyle(Tokens.text)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, Tokens.space7)
        .padding(.vertical, Tokens.space6)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }

    private var ringPanel: some View {
        VStack(spacing: Tokens.space5) {
            Spacer(minLength: .zero)
            CountdownRing(secondsLeft: state.countdown.ringSeconds, total: state.countdown.ringSeconds)
                .padding(.horizontal, Tokens.space3)
            Text(state.previewCaption)
                .font(Tokens.mono(Tokens.sizeMicro, .regular))
                .tracking(TypeRole.eyebrow.tracking)
                .foregroundStyle(Tokens.text3)
            Button { event(.done) } label: {
                Label(state.doneTitle, systemImage: "checkmark")
            }
            .buttonStyle(.action(.host))
            Spacer(minLength: .zero)
        }
        .padding(Tokens.space7)
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxHeight: .infinity)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }
}
