import DesignSystem
import SwiftUI

/// Shows only the chosen mode. The screens own their shells and headers.
public struct ModeSwitchView<Host: View, Client: View>: View {

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
            case .host: host().id(Side.host)
            case .client: client().id(Side.client)
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
    }
}
