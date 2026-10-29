import DesignSystem
import ModeSwitchUI
import SwiftUI
import HostUI
import SettingsUI
import ClientUI
import ClientPaymentUI

public struct RootView: View {
    private let root: AppRoot

    public init(root: AppRoot) { self.root = root }

    public var body: some View {
        ModeSwitchView(state: root.modeSwitchState, event: { event in
            switch event {
            case .choose(let side): root.choose(side)
            }
        }, host: {
            if let host = root.host { HostScreen(host: host) }
        }, client: {
            if let client = root.client { ClientScreen(client: client) }
        })
    }
}

private struct HostScreen: View {
    @Bindable var host: HostMode
    var body: some View {
        HostView(state: host.screen, event: host.event)
            .sheet(isPresented: $host.settingsPresented) {
                SettingsView(state: host.settingsScreen, event: host.event)
            }
    }
}

private struct ClientScreen: View {
    let client: ClientMode
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Group {
            if let state = client.paymentScreen {
                ClientPaymentView(state: state, event: client.event).transition(Motion.panelTransition(reduced: reduceMotion))
            } else {
                ClientView(state: client.screen, event: client.event).transition(Motion.panelTransition(reduced: reduceMotion))
            }
        }
        .animation(Motion.panel(reduced: reduceMotion).animation, value: client.paymentScreen != nil)
    }
}
