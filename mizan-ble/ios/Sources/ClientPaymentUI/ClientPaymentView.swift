import DesignSystem
import SwiftUI

public struct ClientPaymentView: View {
    private let state: ClientPaymentState
    private let event: (ClientPaymentEvent) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                ExchangeStrip(state.exchange)
                Spacer(minLength: Tokens.space1)
                content
                Spacer(minLength: Tokens.space1)
            }
        } actions: {
            if !state.actions.isEmpty {
                HStack(spacing: Tokens.space3) {
                    ForEach(state.actions, id: \.id) { action in
                        button(action).transition(Motion.itemTransition(reduced: reduceMotion, from: .bottom))
                    }
                }
                .motion(.standard, value: state.actionsProjection)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        Group { switch state.content {
        case let .review(title, digits, detail):
            StatusPanel(title, detail: detail, level: .screen) {
                EmptyView()
            } value: {
                amount(digits)
            } footer: {
                EmptyView()
            }
            .transition(Motion.panelTransition(reduced: reduceMotion))
        case let .result(mark, title, detail):
            StatusPanel(title, detail: detail, level: .screen) {
                ResultMark(mark)
            } value: {
                EmptyView()
            } footer: {
                EmptyView()
            }
            .transition(Motion.panelTransition(reduced: reduceMotion))
        case let .processing(digits, rows):
            VStack(alignment: .leading, spacing: Tokens.space4) {
                amount(digits)
                Card(isCompact: true, padding: .list) {
                    DividedList(rows, id: \.title) { row in
                        receiptRow(row).transition(Motion.itemTransition(reduced: reduceMotion, from: .bottom))
                    }
                }
            }
            .transition(Motion.panelTransition(reduced: reduceMotion))
        case let .paid(title, digits, detail):
            StatusPanel(title, detail: detail, level: .screen) {
                ResultMark(.success)
            } value: {
                amount(digits)
            } footer: {
                EmptyView()
            }
            .transition(Motion.panelTransition(reduced: reduceMotion))
        }}
        .motion(.panel, value: state.contentProjection)
    }
    private func amount(_ digits: String) -> some View {
        AmountView(digits, size: .l, isMonospaced: false)
    }
    private func receiptRow(_ row: ClientPaymentState.ReceiptRow) -> some View {
        HStack(spacing: Tokens.space3) {
            IconBadge(
                .small, systemImage: row.symbol,
                color: row.isComplete ? Tokens.onAccent : Tokens.clientHi,
                tint: row.isComplete ? Tokens.ok : Tokens.clientTint
            )
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(row.title).typeRole(.labelS)
                    .foregroundStyle(row.isComplete ? Tokens.text : Tokens.clientHi)
                Text(row.detail).typeRole(.eyebrow)
            }
        }
    }
    private func button(_ action: ClientPaymentState.Action) -> some View {
        ActionButton(action.title, systemImage: action.symbol, kind: action.kind, isEnabled: action.isEnabled) {
            event(action.event)
        }
    }
}
