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
            VStack(spacing: Tokens.space3) {
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
        case let .review(title, amount, detail):
            VStack(spacing: Tokens.space2) {
                Text(title).typeRole(.title)
                AmountView(amount, size: .l)
                Text(detail).typeRole(.body).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, Tokens.space2)
            .multilineTextAlignment(.center)
        case let .result(mark, title, detail):
            VStack(spacing: Tokens.space6) {
                ResultMark(mark)
                VStack(spacing: Tokens.space3) {
                    Text(title).typeRole(.title)
                    Text(detail).typeRole(.body).fixedSize(horizontal: false, vertical: true)
                }
            }
            .multilineTextAlignment(.center)
        case let .processing(amount, rows):
            VStack(spacing: Tokens.space4) {
                AmountView(amount, size: .l)
                VStack(alignment: .leading, spacing: Tokens.space3) {
                    ForEach(rows.indices, id: \.self) { index in
                        if index != rows.startIndex { Divider().overlay(Tokens.line) }
                        receiptRow(rows[index])
                    }
                }
                .padding(Tokens.space4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusLg))
            }
        case let .paid(title, amount, detail):
            VStack(spacing: Tokens.space5) {
                ResultMark(.success)
                VStack(spacing: Tokens.space2) {
                    Text(title).typeRole(.title)
                    AmountView(amount, size: .l)
                    Text(detail).typeRole(.body).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, Tokens.space1)
            .multilineTextAlignment(.center)
        }
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
                Text(row.detail).typeRole(.eyebrow)
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
