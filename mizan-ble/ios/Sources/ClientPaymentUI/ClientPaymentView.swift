import DesignSystem
import SwiftUI

public struct ClientPaymentView: View {
    private let state: ClientPaymentState
    private let event: (ClientPaymentEvent) -> Void

    @Environment(\.isEnabled) private var isEnabled

    public init(state: ClientPaymentState, event: @escaping (ClientPaymentEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        IPhoneShell(
            eyebrow: state.eyebrow,
            status: StatusPill(state.pill.title, state: state.pill.tone),
            onSwitch: { _ in }
        ) {
            ClientStepper([
                state.steps.find, state.steps.connect, state.steps.review, state.steps.result
            ])
        } content: {
            VStack(spacing: Tokens.space4) {
                ExchangeStrip(
                    host: DeviceChip(.host, code: state.exchange.hostCode, state: state.exchange.hostDetail),
                    message: Message(
                        state.exchange.message, direction: state.exchange.direction,
                        tone: state.exchange.tone, systemImage: state.exchange.symbol
                    ),
                    client: DeviceChip(.client, code: state.exchange.clientCode, state: state.exchange.clientDetail)
                )
                .lineLimit(1)
                Spacer(minLength: Tokens.space1)
                content
                Spacer(minLength: Tokens.space1)
                if !state.actions.isEmpty {
                    HStack(spacing: Tokens.space3) {
                        ForEach(state.actions.indices, id: \.self) { index in
                            button(state.actions[index])
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state.content {
        case let .review(title, digits, detail):
            VStack(spacing: Tokens.space2) {
                Text(title).typeRole(.title)
                amount(digits)
                detailText(detail)
            }
            .multilineTextAlignment(.center)
        case let .result(mark, title, detail):
            VStack(spacing: Tokens.space5) {
                ResultMark(mark)
                VStack(spacing: Tokens.space2) {
                    Text(title).typeRole(.title)
                    detailText(detail)
                }
            }
            .multilineTextAlignment(.center)
        case let .processing(digits, rows):
            VStack(alignment: .leading, spacing: Tokens.space4) {
                amount(digits)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(rows.indices, id: \.self) { index in
                        receiptRow(rows[index])
                            .padding(.vertical, Tokens.space3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(alignment: .bottom) {
                                if index != rows.indices.last {
                                    Rectangle().fill(Tokens.lineSoft).frame(height: 1)
                                }
                            }
                    }
                }
                .padding(.horizontal, Tokens.space4)
                .padding(.vertical, Tokens.space1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusLg))
            }
        case let .paid(title, digits, detail):
            VStack(spacing: Tokens.space5) {
                ResultMark(.success)
                VStack(spacing: Tokens.space2) {
                    Text(title).typeRole(.title)
                    amount(digits)
                    detailText(detail)
                }
            }
            .multilineTextAlignment(.center)
        }
    }

    private func amount(_ digits: String) -> some View {
        AmountView(digits, size: .l, isMonospaced: false)
    }

    private func detailText(_ text: String) -> some View {
        Text(text).typeRole(.body)
            .lineSpacing(Tokens.space1)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minHeight: Tokens.space6)
    }

    private func receiptRow(_ row: ClientPaymentState.ReceiptRow) -> some View {
        HStack(spacing: Tokens.space3) {
            Image(systemName: row.symbol).typeRole(.small)
                .foregroundStyle(row.isComplete ? Tokens.onAccent : Tokens.clientHi)
                .frame(width: Tokens.space7, height: Tokens.space7)
                .background(row.isComplete ? Tokens.ok : Tokens.clientTint, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(row.title).typeRole(.labelS)
                    .foregroundStyle(row.isComplete ? Tokens.text : Tokens.clientHi)
                Text(row.detail).font(Tokens.mono(Tokens.sizeEyebrow, .regular))
                    .foregroundStyle(Tokens.text2)
            }
        }
    }

    private func button(_ action: ClientPaymentState.Action) -> some View {
        Button {
            guard action.isEnabled && isEnabled else { return }
            event(action.event)
        } label: {
            Label(action.title, systemImage: action.symbol)
        }
        .buttonStyle(.action(action.kind))
        .disabled(!action.isEnabled)
        .opacity(action.isEnabled ? 1 : 0.4)
    }
}
