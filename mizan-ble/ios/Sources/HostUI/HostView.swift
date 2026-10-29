import DesignSystem
import SwiftUI

public struct HostView: View {
    private let state: HostState
    private let event: (HostEvent) -> Void

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.modeSwitch) private var modeSwitch

    public init(state: HostState, event: @escaping (HostEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        IPadShell(
            eyebrow: state.eyebrow,
            status: StatusPill(state.status, state: state.statusTone),
            deviceCode: state.deviceCode, deviceMeta: state.deviceMeta,
            onSwitch: { modeSwitch?.onSelect($0) },
            onSettings: {
                guard isEnabled, state.isSettingsEnabled else { return }
                event(.openSettings)
            },
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

    private var amount: some View {
        VStack(alignment: .leading, spacing: Tokens.space5) {
            if let notice = state.notice { note(notice) }
            Text(state.amountTitle).typeRole(.lead)
            // A narrow column, as on an iPad in portrait, takes the next
            // size down whole, sign and digits, rather than cutting digits.
            ViewThatFits(in: .horizontal) {
                ForEach(AmountView.Size.allCases, id: \.self) { size in
                    AmountView(state.amount, size: size, digitsColor: state.isAmountMuted ? Tokens.text2 : Tokens.text)
                        .fixedSize()
                }
                AmountView(state.amount, size: .m, digitsColor: state.isAmountMuted ? Tokens.text2 : Tokens.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            Rectangle().fill(state.accent == .idle ? Tokens.lineStrong : state.accent.color)
                .frame(width: Tokens.space20 + Tokens.space10, height: Tokens.space1 / 2)
            if !state.explanation.isEmpty {
                Text(state.explanation).typeRole(.body)
                    .lineSpacing(Tokens.space1)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ExchangeStrip(
                host: DeviceChip(.host, code: state.exchange.hostCode, state: state.exchange.hostDetail),
                message: Message(
                    state.exchange.message, direction: state.exchange.direction,
                    tone: state.exchange.tone, systemImage: state.exchange.symbol
                ),
                client: DeviceChip(
                    state.exchange.clientIsEmpty ? .empty : .client,
                    code: state.exchange.clientCode, state: state.exchange.clientDetail
                )
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func note(_ notice: HostState.Notice) -> some View {
        HStack(spacing: Tokens.space3) {
            Image(systemName: notice.symbol).typeRole(.lead)
                .foregroundStyle(notice.isFailure ? Tokens.bad : Tokens.hostHi)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(notice.title).typeRole(.label)
                Text(notice.detail).typeRole(.small).foregroundStyle(Tokens.text2)
            }
        }
        .padding(.horizontal, Tokens.space5)
        .padding(.vertical, Tokens.space3)
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
                                ForEach(rows[row].indices, id: \.self) { column in
                                    key(rows[row][column]).frame(maxHeight: .infinity)
                                }
                            }
                        }
                    }
                    buttons
                }
                .padding(Tokens.space4)
            case let .countdown(countdown, title, detail):
                VStack(spacing: Tokens.space5) {
                    CountdownRing(
                        secondsText: countdown.seconds, caption: countdown.caption,
                        accessibilityLabel: countdown.accessibilityLabel, fraction: countdown.fraction
                    )
                    Text(title).font(Tokens.text(Tokens.sizeLead, .semibold)).foregroundStyle(Tokens.text)
                    Text(detail).typeRole(.eyebrow).multilineTextAlignment(.center)
                    buttons
                }
                .padding(Tokens.space7)
            case let .connection(title, detail, secondsRemaining):
                VStack(spacing: Tokens.space5) {
                    BluetoothSymbol().foregroundStyle(Tokens.clientHi)
                        .frame(width: Tokens.space12, height: Tokens.space12)
                        .frame(width: Tokens.space14 * 2, height: Tokens.space14 * 2)
                        .background(Tokens.clientTint, in: Circle())
                        .accessibilityHidden(true)
                    Text(title).typeRole(.lead).foregroundStyle(Tokens.text)
                    Text(detail).typeRole(.eyebrow).multilineTextAlignment(.center)
                    buttons
                }
                .padding(Tokens.space7)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .bottom) {
                    if let secondsRemaining {
                        Text(secondsRemaining).typeRole(.code).foregroundStyle(Tokens.hostHi)
                            .padding(Tokens.space7)
                    }
                }
            case let .result(outcome, title):
                ResultCard(outcome, title: title) { buttons }
            case let .processor(eyebrow, title):
                VStack(spacing: Tokens.space6) {
                    Text(eyebrow).typeRole(.eyebrow).foregroundStyle(Tokens.hostHi)
                    Text(title).typeRole(.lead).foregroundStyle(Tokens.text)
                    buttons
                }
                .padding(Tokens.space7)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }

    @ViewBuilder
    private func key(_ action: HostAction) -> some View {
        Group {
            if action.symbol.isEmpty {
                KeypadKey(action.title) { send(action) }
            } else {
                KeypadKey(systemImage: action.symbol, accessibilityLabel: action.title) { send(action) }
            }
        }
        .disabled(!action.isEnabled)
        .allowsHitTesting(action.isEnabled && isEnabled)
        .opacity(action.isEnabled ? 1 : 0.5)
    }

    @ViewBuilder
    private var buttons: some View {
        if !state.buttons.isEmpty {
            VStack(spacing: Tokens.space5) {
                ForEach(state.buttons.indices, id: \.self) { index in
                    let action = state.buttons[index]
                    Button { send(action) } label: {
                        Label(action.title, systemImage: action.symbol)
                    }
                    .buttonStyle(.action(action.kind))
                    .disabled(!action.isEnabled)
                    .allowsHitTesting(action.isEnabled && isEnabled)
                    .opacity(action.isEnabled ? 1 : 0.5)
                }
            }
        }
    }

    private func send(_ action: HostAction) {
        guard isEnabled, action.isEnabled else { return }
        event(action.event)
    }
}
