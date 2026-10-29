import DesignSystem
import SwiftUI

public struct SettingsView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private let state: SettingsState
    private let event: (SettingsEvent) -> Void

    public init(state: SettingsState, event: @escaping (SettingsEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        if horizontalSizeClass == .compact {
            IPhoneShell(
                side: .host, eyebrow: state.eyebrow, status: StatusPill(state.statusText),
                onSwitch: { _ in }, headerTopPadding: Tokens.space2,
                contentBottomPadding: Tokens.space4
            ) {
                CompactHostSteps(state.steps, onSettings: {})
            } content: {
                ViewThatFits(in: .vertical) {
                    column { doneButton }.fixedSize(horizontal: false, vertical: true)
                    ScrollView { column { doneButton } }
                }
            }
        } else {
            regularShell
        }
    }

    private var regularShell: some View {
        IPadShell(
            eyebrow: state.eyebrow, status: StatusPill(state.statusText),
            deviceCode: state.deviceCode, deviceMeta: state.deviceMeta,
            onSwitch: { _ in }, onSettings: {}
        ) {
            HostRail(state.steps)
        } content: {
            // A window narrower than the design's, as an iPad in portrait,
            // drops the preview ring rather than squeezing the settings.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Tokens.space12) {
                    column { EmptyView() }
                    ringPanel
                }
                column { doneButton }
            }
        }
    }

    private func column(@ViewBuilder footer: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space6) {
            Text(state.title)
                .font(Tokens.display(Tokens.sizeTitle, .medium))
                .foregroundStyle(Tokens.text)
            countdownCard
            readOnlyCard
            footer()
            Spacer(minLength: .zero)
        }
        .frame(minWidth: horizontalSizeClass == .compact ? nil : Tokens.space20 * 4,
               maxWidth: .infinity, alignment: .leading)
    }

    private var doneButton: some View {
        Button { event(.done) } label: {
            Label(state.doneTitle, systemImage: "checkmark")
        }
        .buttonStyle(.action(.host))
    }

    private var countdownCard: some View {
        VStack(alignment: .leading, spacing: Tokens.space5) {
            if horizontalSizeClass == .compact {
                VStack(alignment: .leading, spacing: Tokens.space2) {
                    countdownCopy
                    selectedCountdown
                }
            } else {
                ZStack(alignment: .trailing) {
                    countdownCopy
                    selectedCountdown
                }
            }
            HStack(spacing: Tokens.space1) {
                ForEach(state.countdown.choices, id: \.seconds) { choice in
                    countdownChoice(choice)
                }
            }
            .padding(Tokens.space1)
            .background(Tokens.rail, in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
        }
        .padding(horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space7)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }

    private var countdownCopy: some View {
        VStack(alignment: .leading, spacing: Tokens.space1) {
            Text(state.countdown.title)
                .font(Tokens.text(Tokens.sizeLead, .bold))
                .foregroundStyle(Tokens.text)
            Text(state.countdown.detail)
                .font(Tokens.text(Tokens.sizeLabel))
                .foregroundStyle(Tokens.text2)
                .lineLimit(horizontalSizeClass == .compact ? nil : 1)
                .allowsTightening(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var selectedCountdown: some View {
        Text(state.countdown.selectedText)
            .font(Tokens.display(Tokens.sizeTitle, .medium))
            .foregroundStyle(Tokens.hostHi)
            .contentTransition(.numericText())
            .animation(Motion.fast(reduced: reduceMotion).animation, value: state.countdown.selectedText)
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
        .animation(Motion.fast(reduced: reduceMotion).animation, value: selected)
    }

    private var readOnlyCard: some View {
        VStack(spacing: Tokens.space5) {
            ForEach(state.readOnlyRows.indices, id: \.self) { index in
                if index != state.readOnlyRows.startIndex {
                    Tokens.line.frame(height: 1).frame(height: 0)
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
        .padding(.horizontal, horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space7)
        .padding(.vertical, horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space6)
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
            doneButton
            Spacer(minLength: .zero)
        }
        .padding(Tokens.space7)
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxHeight: .infinity)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }
}
