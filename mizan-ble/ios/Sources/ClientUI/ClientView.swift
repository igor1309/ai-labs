import DesignSystem
import SwiftUI

public struct ClientView: View {
    private let state: ClientState
    private let event: (ClientEvent) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(state: ClientState, event: @escaping (ClientEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        IPhoneShell(
            eyebrow: state.eyebrow,
            status: StatusPill(state.status, state: state.statusTone),
            onSwitch: { _ in }
        ) {
            ClientStepper(state.steps.sessionSteps)
        } content: {
            VStack(spacing: Tokens.space3) {
                ExchangeStrip(state.exchange)
                Spacer(minLength: Tokens.space1)
                StatusPanel(state.title, detail: state.detail, level: .screen) {
                    illustration
                        .frame(width: Tokens.space20 * 3, height: Tokens.space20 * 3)
                } value: {
                    EmptyView()
                } footer: {
                    EmptyView()
                }
                Spacer(minLength: Tokens.space1)
            }
        } actions: {
            ForEach(state.actions, id: \.id) { action in
                button(action).transition(Motion.itemTransition(reduced: reduceMotion, from: .bottom))
            }
            .motion(.standard, value: state.actionsProjection)
        }
        .frame(maxWidth: Tokens.space20 * 5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .motion(.panel, value: state.contentProjection)
    }

    @ViewBuilder
    private var illustration: some View {
        Group { switch state.content {
        case let .discovery(icon, isInRange):
            iconView(icon, foreground: isInRange ? Tokens.onAccent : Tokens.text2)
                .frame(width: Tokens.sizeRing, height: Tokens.sizeRing)
                .background(isInRange ? Tokens.client : Tokens.raised2, in: Circle())
                .frame(width: Tokens.space20 + Tokens.space10, height: Tokens.space20 + Tokens.space10)
                .background(isInRange ? Tokens.clientTint : Tokens.overlay, in: Circle())
                .frame(width: Tokens.space20 * 2 + Tokens.space5, height: Tokens.space20 * 2 + Tokens.space5)
                .overlay { Circle().strokeBorder(isInRange ? Tokens.clientTint : Tokens.line, lineWidth: 1.5) }
                .frame(width: Tokens.space20 * 3, height: Tokens.space20 * 3)
                .overlay { Circle().strokeBorder(isInRange ? Tokens.clientTint : Tokens.line, lineWidth: 1.5) }
                .motion(.standard, value: state.rangeProjection)
                .accessibilityHidden(true)
                .transition(Motion.panelTransition(reduced: reduceMotion))
        case .connectionFailure:
            IconBadge(.large, tint: Tokens.badTint) {
                BluetoothSymbol(isSlashed: true).fill(Tokens.bad)
            }
            .transition(Motion.panelTransition(reduced: reduceMotion))
        }}
    }

    @ViewBuilder
    private func iconView(_ icon: ClientState.Icon, foreground: Color) -> some View {
        Group { switch icon {
        case let .bluetooth(isSlashed):
            BluetoothSymbol(isSlashed: isSlashed)
                .fill(foreground)
                .frame(width: Tokens.sizeHeading, height: Tokens.sizeHeading)
                .motion(.standard, value: isSlashed)
        case let .system(name, rotation):
            Image(systemName: name).typeRole(.heading).foregroundStyle(foreground)
                .rotationEffect(.degrees(rotation))
                .motion(.standard, value: rotation)
        }}
    }

    private func button(_ action: ClientState.Action) -> some View {
        ActionButton(action.title, kind: action.kind, isEnabled: action.isEnabled) {
            event(action.event)
        } icon: {
            switch action.icon {
            case let .bluetooth(isSlashed):
                BluetoothSymbol(isSlashed: isSlashed)
                    .frame(width: Tokens.space4, height: Tokens.space4)
            case let .system(name, rotation):
                Image(systemName: name)
                    .rotationEffect(.degrees(rotation))
            }
        }
    }
}
