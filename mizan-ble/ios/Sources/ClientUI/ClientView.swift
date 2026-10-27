import DesignSystem
import SwiftUI

public struct ClientView: View {
    private let state: ClientState
    private let event: (ClientEvent) -> Void

    @Environment(\.isEnabled) private var environmentIsEnabled

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
                ExchangeStrip(
                    host: DeviceChip(.host, code: state.exchange.hostCode, state: state.exchange.hostDetail),
                    message: Message(
                        state.exchange.message, direction: state.exchange.direction,
                        tone: state.exchange.tone, systemImage: state.exchange.symbol
                    ),
                    client: DeviceChip(.client, code: state.exchange.clientCode, state: state.exchange.clientDetail)
                )
                Spacer(minLength: Tokens.space1)
                VStack(spacing: Tokens.space6) {
                    illustration
                    VStack(spacing: Tokens.space3) {
                        Text(state.title).typeRole(.title)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(state.detail).typeRole(.body)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .multilineTextAlignment(.center)
                }
                Spacer(minLength: Tokens.space1)
                ForEach(state.actions.indices, id: \.self) { index in
                    button(state.actions[index])
                }
            }
        }
        .frame(maxWidth: Tokens.space20 * 5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var illustration: some View {
        switch state.content {
        case let .discovery(icon, isInRange):
            iconView(icon, foreground: isInRange ? Tokens.onAccent : Tokens.text2)
                .frame(width: Tokens.space20, height: Tokens.space20)
                .background(isInRange ? Tokens.client : Tokens.raised2, in: Circle())
                .padding(Tokens.space5)
                .background(isInRange ? Tokens.clientTint : Tokens.overlay, in: Circle())
                .padding(Tokens.space7)
                .overlay { Circle().strokeBorder(isInRange ? Tokens.clientTint : Tokens.line) }
                .padding(Tokens.space8)
                .overlay { Circle().strokeBorder(isInRange ? Tokens.clientTint : Tokens.line) }
                .accessibilityHidden(true)
        case .connectionFailure:
            BluetoothSymbol(isSlashed: true)
                .fill(Tokens.bad)
                .frame(width: Tokens.sizeKey, height: Tokens.sizeKey)
                .frame(width: Tokens.space14 * 2, height: Tokens.space14 * 2)
                .background(Tokens.badTint, in: Circle())
                .padding(.vertical, Tokens.space8)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func iconView(_ icon: ClientState.Icon, foreground: Color) -> some View {
        switch icon {
        case let .bluetooth(isSlashed):
            BluetoothSymbol(isSlashed: isSlashed)
                .fill(foreground)
                .frame(width: Tokens.sizeHeading, height: Tokens.sizeHeading)
        case let .system(name, rotation):
            Image(systemName: name).typeRole(.heading).foregroundStyle(foreground)
                .rotationEffect(.degrees(rotation))
        }
    }

    private func button(_ action: ClientState.Action) -> some View {
        let enabled = action.isEnabled && environmentIsEnabled
        return Button {
            guard enabled else { return }
            event(action.event)
        } label: {
            Label {
                Text(action.title)
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
        .buttonStyle(.action(action.kind))
        .disabled(!enabled)
        .allowsHitTesting(enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}
