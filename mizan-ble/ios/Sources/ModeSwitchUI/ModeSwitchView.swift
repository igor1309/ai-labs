import DesignSystem
import SwiftUI

/// Shows only the chosen mode. The screens own their shells and headers.
public struct ModeSwitchView<Host: View, Client: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let state: ModeSwitchState
    private let event: (ModeSwitchEvent) -> Void
    private let host: () -> Host
    private let client: () -> Client

    public init(
        state: ModeSwitchState,
        event: @escaping (ModeSwitchEvent) -> Void,
        @ViewBuilder host: @escaping () -> Host,
        @ViewBuilder client: @escaping () -> Client
    ) {
        self.state = state
        self.event = event
        self.host = host
        self.client = client
    }

    public var body: some View {
        Group {
            switch state.side {
            case .host: host().id(Side.host).transition(Motion.panelTransition(reduced: reduceMotion))
            case .client: client().id(Side.client).transition(Motion.panelTransition(reduced: reduceMotion))
            }
        }
        .environment(\.modeSwitch, ModeSwitchConfiguration(
            side: state.side,
            isEnabled: state.isEnabled,
            onSelect: { side in
                guard state.isEnabled else { return }
                event(.choose(side))
            }
        ))
        .animation(Motion.panel(reduced: reduceMotion).animation, value: state.sideProjection)
    }
}
