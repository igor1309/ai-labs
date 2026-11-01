import DesignSystem
import SwiftUI

private struct ModeSwitchPreviewPair: View {
    let state: ModeSwitchState
    let scheme: ColorScheme

    var body: some View {
        HStack(alignment: .top, spacing: Tokens.space5) {
            preview(isPad: true).frame(width: 1194, height: 834)
            preview(isPad: false).frame(width: 393, height: 852)
        }
        .padding(Tokens.space5)
        .background(Tokens.rail)
        .environment(\.colorScheme, scheme)
    }

    private func preview(isPad: Bool) -> some View {
        ModeSwitchView(state: state, event: { _ in }) {
            screen(side: .host, isPad: isPad)
        } client: {
            screen(side: .client, isPad: isPad)
        }
    }

    @ViewBuilder
    private func screen(side: Side, isPad: Bool) -> some View {
        if isPad {
            IPadShell(
                side: side, eyebrow: "MODE PREVIEW", status: StatusPill("Stand-in"),
                deviceCode: "MIZAN-7F3A", deviceMeta: "Preview device",
                onSwitch: { _ in }, onSettings: {}, isSettingsEnabled: state.isEnabled
            ) {
                Text("Session steps").typeRole(.small)
            } content: {
                content(side: side)
            }
        } else {
            IPhoneShell(
                side: side, eyebrow: "MODE PREVIEW", status: StatusPill("Stand-in"),
                onSwitch: { _ in }
            ) {
                Text("Session steps").typeRole(.small)
            } content: {
                content(side: side)
            }
        }
    }

    private func content(side: Side) -> some View {
        Text(side == .host ? "Host screen" : "Client screen")
            .typeRole(.title)
    }
}

#Preview("Host enabled · light", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .host, isEnabled: true), scheme: .light)
}
#Preview("Host enabled · dark", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .host, isEnabled: true), scheme: .dark)
}
#Preview("Host disabled · light", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .host, isEnabled: false), scheme: .light)
}
#Preview("Host disabled · dark", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .host, isEnabled: false), scheme: .dark)
}
#Preview("Client enabled · light", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .client, isEnabled: true), scheme: .light)
}
#Preview("Client enabled · dark", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .client, isEnabled: true), scheme: .dark)
}
#Preview("Client disabled · light", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .client, isEnabled: false), scheme: .light)
}
#Preview("Client disabled · dark", traits: .sizeThatFitsLayout) {
    ModeSwitchPreviewPair(state: .init(side: .client, isEnabled: false), scheme: .dark)
}
