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
                onSwitch: { modeSwitch?.onSelect($0) }, headerTopPadding: Tokens.space2,
                contentBottomPadding: Tokens.space2
            ) {
                CompactHostSteps(state.steps, isSettingsEnabled: state.isSettingsEnabled, onSettings: openSettings)
            } content: {
                ViewThatFits(in: .vertical) {
                    compactContent
                    ScrollView { compactContent }
                }
            }
        } else {
            regularShell
        }
    }

    private var compactContent: some View {
        VStack(spacing: Tokens.space3) {
            amount
            panel
        }
        .fixedSize(horizontal: false, vertical: true)
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
            } else {
                Text(state.amountTitle).typeRole(.lead)
                amountValue
            }
            Rectangle().fill(state.accent == .idle ? Tokens.lineStrong : state.accent.color)
                .frame(width: Tokens.space20 + Tokens.space10, height: Tokens.space1 / 2)
            if !state.explanation.isEmpty && (horizontalSizeClass != .compact || state.notice == nil) {
                Text(state.explanation).typeRole(horizontalSizeClass == .compact ? .small : .body)
                    .lineSpacing(Tokens.space1)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
            exchange
        }
        .frame(maxWidth: .infinity, maxHeight: horizontalSizeClass == .compact ? nil : .infinity, alignment: .leading)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: state.noticeProjection)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: state.toneProjection)
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
        ExchangeStrip(
            host: DeviceChip(.host, code: state.exchange.hostCode, state: state.exchange.hostDetail),
            message: Message(
                state.exchange.message, direction: state.exchange.direction,
                tone: state.exchange.tone, systemImage: state.exchange.symbol
            ),
            client: DeviceChip(
                state.exchange.clientIsEmpty ? .empty : .client,
                code: state.exchange.clientCode, state: state.exchange.clientDetail
            ),
            isCompact: horizontalSizeClass == .compact
        )
    }

    private func note(_ notice: HostState.Notice) -> some View {
        HStack(spacing: Tokens.space3) {
            Image(systemName: notice.symbol).typeRole(.lead)
                .foregroundStyle(notice.isFailure ? Tokens.bad : Tokens.hostHi)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(notice.title).typeRole(horizontalSizeClass == .compact ? .labelS : .label)
                Text(notice.detail).typeRole(.small).foregroundStyle(Tokens.text2)
            }
        }
        .padding(.horizontal, horizontalSizeClass == .compact ? Tokens.space3 : Tokens.space5)
        .padding(.vertical, horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            notice.isFailure ? Tokens.badTint : Tokens.hostTint,
            in: RoundedRectangle(cornerRadius: Tokens.radiusLg)
        )
    }

    private var panel: some View {
        Group {
            switch state.panel {
            case let .keypad(rows):
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
                    buttons
                }
                .padding(horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space4)
                .transition(Motion.panelTransition(reduced: reduceMotion))
            case let .countdown(countdown, title, detail):
                VStack(spacing: horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space5) {
                    CountdownRing(
                        secondsText: countdown.seconds, caption: countdown.caption,
                        accessibilityLabel: countdown.accessibilityLabel, fraction: countdown.fraction,
                        isCompact: horizontalSizeClass == .compact
                    )
                    Text(title).font(Tokens.text(Tokens.sizeLead, .semibold)).foregroundStyle(Tokens.text)
                    Text(detail).typeRole(.eyebrow).multilineTextAlignment(.center)
                    buttons
                }
                .padding(horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space7)
                .transition(Motion.panelTransition(reduced: reduceMotion))
            case let .connection(title, detail, secondsRemaining):
                VStack(spacing: horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space5) {
                    BluetoothSymbol().foregroundStyle(Tokens.clientHi)
                        .frame(width: Tokens.space12, height: Tokens.space12)
                        .frame(width: Tokens.space14 * 2, height: Tokens.space14 * 2)
                        .background(Tokens.clientTint, in: Circle())
                        .accessibilityHidden(true)
                    Text(title).typeRole(.lead).foregroundStyle(Tokens.text)
                    Text(detail).typeRole(.eyebrow).multilineTextAlignment(.center)
                    buttons
                }
                .padding(horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space7)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(Motion.panelTransition(reduced: reduceMotion))
                .overlay(alignment: .bottom) {
                    if let secondsRemaining {
                        Text(secondsRemaining).typeRole(.code).foregroundStyle(Tokens.hostHi)
                            .padding(Tokens.space7)
                    }
                }
            case let .result(outcome, title):
                ResultCard(outcome, title: title, isCompact: horizontalSizeClass == .compact) { buttons }
                    .transition(Motion.panelTransition(reduced: reduceMotion))
            case let .processor(eyebrow, title):
                VStack(spacing: horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space6) {
                    Text(eyebrow).typeRole(.eyebrow).foregroundStyle(Tokens.hostHi)
                    Text(title).typeRole(.lead).foregroundStyle(Tokens.text)
                    buttons
                }
                .padding(horizontalSizeClass == .compact ? Tokens.space4 : Tokens.space7)
                .transition(Motion.panelTransition(reduced: reduceMotion))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
        .animation(Motion.panel(reduced: reduceMotion).animation, value: state.panelProjection)
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

    @ViewBuilder
    private var buttons: some View {
        if !state.buttons.isEmpty {
            VStack(spacing: horizontalSizeClass == .compact ? Tokens.space2 : Tokens.space5) {
                ForEach(state.buttons) { action in
                    Button { send(action) } label: {
                        Label(action.title, systemImage: action.symbol)
                    }
                    .buttonStyle(.action(action.kind))
                    .disabled(!action.isEnabled)
                    .allowsHitTesting(action.isEnabled && isEnabled)
                    .opacity(action.isEnabled ? 1 : 0.5)
                    .transition(Motion.itemTransition(reduced: reduceMotion, from: .bottom))
                }
            }
            .animation(Motion.standard(reduced: reduceMotion).animation, value: state.buttonsProjection)
        }
    }

    private func send(_ action: HostAction) {
        guard isEnabled, action.isEnabled else { return }
        event(action.event)
    }
}
