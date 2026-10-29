import DesignSystem
import ModeSwitchUI
import SwiftUI
import HostUI
import SettingsUI

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
            placeholder(.client)
        })
    }

    private func placeholder(_ side: Side) -> some View {
        VStack(alignment: .leading, spacing: Tokens.space8) {
            ModeHeader(side: side, layout: .bar, onSwitch: root.choose)
            Spacer(minLength: Tokens.space8)
            Text(side == .host ? "Host" : "Client")
                .font(TypeRole.title.font)
                .foregroundStyle(side.accent)
            Text(side == .host ? "Host screens will appear here." : "Client screens will appear here.")
                .font(TypeRole.body.font)
                .foregroundStyle(Tokens.text2)
            Spacer(minLength: Tokens.space8)
        }
        .padding(Tokens.space5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.ground)
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
