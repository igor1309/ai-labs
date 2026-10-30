import DesignSystem
import SwiftUI

public struct SettingsView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private let state: SettingsState
    private let event: (SettingsEvent) -> Void

    public init(state: SettingsState, event: @escaping (SettingsEvent) -> Void) {
        self.state = state
        self.event = event
    }

    private var isCompact: Bool { horizontalSizeClass == .compact }

    public var body: some View {
        if isCompact {
            IPhoneShell(
                side: .host, eyebrow: state.eyebrow, status: StatusPill(state.statusText),
                onSwitch: { _ in }
            ) {
                CompactHostSteps(state.steps, onSettings: {})
            } content: {
                ViewThatFits(in: .vertical) {
                    column.fixedSize(horizontal: false, vertical: true)
                    ScrollView { column }
                }
            } actions: {
                doneButton
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
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Tokens.space12) {
                    column
                    ringPanel
                }
                VStack(alignment: .leading, spacing: Tokens.space6) {
                    column
                    doneButton
                }
            }
        }
    }

    private var column: some View {
        VStack(alignment: .leading, spacing: isCompact ? Tokens.space4 : Tokens.space6) {
            Text(state.title).typeRole(.title)
            countdownCard
            readOnlyCard
            Spacer(minLength: .zero)
        }
        .frame(
            minWidth: isCompact ? nil : Tokens.space20 * 4, idealWidth: isCompact ? nil : Tokens.space20 * 4,
            maxWidth: .infinity, alignment: .leading
        )
    }

    private var doneButton: some View {
        ActionButton(state.doneTitle, systemImage: "checkmark", kind: .host) { event(.done) }
    }

    private var countdownCard: some View {
        Card(isCompact: isCompact) {
            VStack(alignment: .leading, spacing: Tokens.space5) {
                if isCompact {
                    VStack(alignment: .leading, spacing: Tokens.space2) {
                        countdownCopy
                        selectedCountdown
                    }
                } else {
                    HStack(alignment: .top, spacing: Tokens.space4) {
                        countdownCopy
                        selectedCountdown
                    }
                }
                SegmentedPicker(
                    state.countdown.choices.map { .init($0.seconds, title: $0.text) },
                    selection: state.countdown.selectedSeconds
                ) { event(.chooseCountdown($0)) }
            }
        }
    }

    private var countdownCopy: some View {
        VStack(alignment: .leading, spacing: Tokens.space1) {
            Text(state.countdown.title).typeRole(.lead).foregroundStyle(Tokens.text)
            Text(state.countdown.detail).typeRole(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var selectedCountdown: some View {
        Text(state.countdown.selectedText).typeRole(.title).foregroundStyle(Tokens.hostHi)
            .contentTransition(.numericText())
            .motion(.fast, value: state.countdown.selectedText)
    }

    private var readOnlyCard: some View {
        Card(isCompact: isCompact, padding: .list) {
            DividedList(state.readOnlyRows, id: \.title) { KeyValueRow($0.title, value: $0.value) }
        }
    }

    private var ringPanel: some View {
        Card(isCompact: false) {
            VStack(spacing: Tokens.space5) {
                Spacer(minLength: .zero)
                CountdownRing(secondsLeft: state.countdown.ringSeconds, total: state.countdown.ringSeconds)
                    .padding(.horizontal, Tokens.space3)
                Text(state.previewCaption).typeRole(.eyebrow).foregroundStyle(Tokens.text3)
                doneButton
                Spacer(minLength: .zero)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxHeight: .infinity)
    }
}
