import DesignSystem
import SwiftUI

public struct HostView: View {
    private let state: HostState
    private let event: (HostEvent) -> Void

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.modeSwitch) private var modeSwitch
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(state: HostState, event: @escaping (HostEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        if horizontalSizeClass == .compact {
            IPhoneShell(
                side: .host, eyebrow: state.eyebrow,
                status: StatusPill(state.status, state: state.statusTone),
                onSwitch: { modeSwitch?.onSelect($0) }
            ) {
                CompactHostSteps(state.steps, isSettingsEnabled: state.isSettingsEnabled, onSettings: openSettings)
            } content: {
                VStack(spacing: Tokens.space3) {
                    amount
                    panel
                }
            } actions: {
                actionButtons
            }
        } else {
            regularShell
        }
    }

    private var regularShell: some View {
        IPadShell(
            eyebrow: state.eyebrow,
            status: StatusPill(state.status, state: state.statusTone),
            deviceCode: state.deviceCode, deviceMeta: state.deviceMeta,
            onSwitch: { modeSwitch?.onSelect($0) },
            onSettings: openSettings,
            isSettingsEnabled: state.isSettingsEnabled
        ) {
            HostRail(state.steps)
        } content: {
            HStack(spacing: Tokens.space12) {
                amount
                panel.frame(width: Tokens.space20 * 4)
            }
        }
    }

    private func openSettings() {
        guard isEnabled, state.isSettingsEnabled else { return }
        event(.openSettings)
    }

    private var amount: some View {
        VStack(alignment: .leading, spacing: horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space5) {
            if let notice = state.notice { note(notice).transition(Motion.itemTransition(reduced: reduceMotion, from: .top)) }
            if horizontalSizeClass == .compact {
                HStack(spacing: Tokens.space3) {
                    Text(state.amountTitle).typeRole(.label)
                    amountValue
                }
                // The amount sits beside the title, so the row takes its new
                // layout at once and fades in, rather than sliding under it.
                .fadesIn(on: state.amountTitle)
            } else {
                Text(state.amountTitle).typeRole(.lead).fadesIn(on: state.amountTitle)
                amountValue
            }
            Rectangle().fill(state.accent == .idle ? Tokens.lineStrong : state.accent.color)
                .frame(width: Tokens.space20 + Tokens.space10, height: Tokens.space1 / 2)
            if !state.explanation.isEmpty && (horizontalSizeClass != .compact || state.notice == nil) {
                Text(state.explanation).typeRole(horizontalSizeClass == .compact ? .small : .body)
                    .lineSpacing(Tokens.space1)
                    .fixedSize(horizontal: false, vertical: true)
                    .fadesIn(on: state.explanation)
                    .transition(.opacity)
            }
            exchange
        }
        .frame(maxWidth: .infinity, maxHeight: horizontalSizeClass == .compact ? nil : .infinity, alignment: .leading)
        .motion(.fast, value: state.noticeProjection)
        .motion(.fast, value: state.toneProjection)
    }

    private var amountValue: some View {
        // A narrow column, as on an iPad in portrait, takes the next
        // size down whole, sign and digits, rather than cutting digits.
        ViewThatFits(in: .horizontal) {
            ForEach(horizontalSizeClass == .compact ? [.m] : AmountView.Size.allCases, id: \.self) { size in
                AmountView(state.amount, size: size, digitsColor: state.isAmountMuted ? Tokens.text2 : Tokens.text)
                    .fixedSize()
            }
            AmountView(state.amount, size: .m, digitsColor: state.isAmountMuted ? Tokens.text2 : Tokens.text)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }

    private var exchange: some View {
        ExchangeStrip(state.exchange, isCompact: horizontalSizeClass == .compact)
    }
    private func note(_ notice: HostState.Notice) -> some View {
        NoticeBanner(
            notice.title, detail: notice.detail, systemImage: notice.symbol,
            tone: notice.isFailure ? .failure : .host, isCompact: horizontalSizeClass == .compact
        )
    }
    private var isCompact: Bool { horizontalSizeClass == .compact }
    private var panel: some View {
        // One container for every panel: a Group would hand the animation to
        // each case, and a case that comes in would then appear at once.
        ZStack {
            switch state.panel {
            case let .keypad(rows):
                Card(isCompact: isCompact, padding: .tight) {
                    VStack(spacing: Tokens.space4) {
                        Grid(horizontalSpacing: .zero, verticalSpacing: Tokens.space1) {
                            ForEach(rows.indices, id: \.self) { row in
                                GridRow {
                                    ForEach(rows[row]) { action in
                                        key(action).frame(maxHeight: .infinity)
                                    }
                                }
                            }
                        }
                        panelButtons
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .transition(Motion.panelTransition(reduced: reduceMotion))
            case let .countdown(countdown, title, detail):
                statusCard(title, detail: detail) {
                    CountdownRing(
                        secondsText: countdown.seconds, caption: countdown.caption,
                        accessibilityLabel: countdown.accessibilityLabel, fraction: countdown.fraction,
                        isCompact: isCompact
                    )
                } value: { EmptyView() }
            case let .connection(title, detail, secondsRemaining):
                statusCard(title, detail: detail) {
                    IconBadge(.large, tint: Tokens.clientTint) {
                        BluetoothSymbol().foregroundStyle(Tokens.clientHi)
                    }
                } value: { EmptyView() } footer: {
                    if let secondsRemaining {
                        Text(secondsRemaining).typeRole(.code).foregroundStyle(Tokens.hostHi)
                    }
                    panelButtons
                }
            case let .result(outcome, title):
                ResultCard(outcome, title: title, isCompact: isCompact) { panelButtons }
                    .transition(Motion.panelTransition(reduced: reduceMotion))
            case let .processor(eyebrow, title):
                statusCard(title, detail: "") {
                    Text(eyebrow).typeRole(.eyebrow).foregroundStyle(Tokens.hostHi)
                } value: { EmptyView() }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // The card's surface stays while one panel fades through to the next.
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
        .motion(.panel, value: state.panelProjection)
    }
    private func statusCard(
        _ title: String, detail: String,
        @ViewBuilder visual: () -> some View, @ViewBuilder value: () -> some View
    ) -> some View {
        statusCard(title, detail: detail, visual: visual, value: value) { panelButtons }
    }
    private func statusCard(
        _ title: String, detail: String,
        @ViewBuilder visual: () -> some View, @ViewBuilder value: () -> some View,
        @ViewBuilder footer: () -> some View
    ) -> some View {
        Card(isCompact: isCompact) {
            StatusPanel(title, detail: detail, level: .panel, isCompact: isCompact,
                        visual: visual, value: value, footer: footer)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .transition(Motion.panelTransition(reduced: reduceMotion))
    }
    @ViewBuilder
    private func key(_ action: HostAction) -> some View {
        Group {
            if action.symbol.isEmpty {
                KeypadKey(action.title, size: horizontalSizeClass == .compact ? .compact : .regular) { send(action) }
            } else {
                KeypadKey(systemImage: action.symbol, accessibilityLabel: action.title,
                          size: horizontalSizeClass == .compact ? .compact : .regular) { send(action) }
            }
        }
        .disabled(!action.isEnabled)
        .allowsHitTesting(action.isEnabled && isEnabled)
        .opacity(action.isEnabled ? 1 : 0.5)
    }

    /// On an iPhone the buttons sit in the shell's actions, at the foot of the screen.
    @ViewBuilder
    private var panelButtons: some View {
        if horizontalSizeClass != .compact { buttons }
    }

    @ViewBuilder
    private var buttons: some View {
        if !state.buttons.isEmpty {
            VStack(spacing: horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space5) {
                actionButtons
            }
        }
    }

    private var actionButtons: some View {
        ActionSlots(state.buttons) { action in
            ActionButton(action.title, systemImage: action.symbol, kind: action.kind, isEnabled: action.isEnabled) {
                send(action)
            }
        }
        .motion(.standard, value: state.buttonsProjection)
    }

    private func send(_ action: HostAction) {
        guard isEnabled, action.isEnabled else { return }
        event(action.event)
    }
}
