import DesignSystem
import SwiftUI

#Preview("iPhone · all settings", traits: .sizeThatFitsLayout) {
    ScrollView(.horizontal) {
        HStack {
            ForEach(SettingsState.previews.indices, id: \.self) { index in
                SettingsView(state: SettingsState.previews[index].state, event: { _ in })
                    .environment(\.horizontalSizeClass, .compact)
                    .environment(\.modeSwitch, .init(side: .host, isEnabled: true, onSelect: { _ in }))
                    .frame(width: 393, height: 852)
            }
        }
    }
}

public extension SettingsState {
    static let previews: [(name: String, state: SettingsState)] = [15, 30, 60, 90, 120].map { seconds in
        (name: "s1-settings-\(seconds)s", state: SettingsState(
            steps: [
                SessionStep(.active, title: "Amount", detail: "Typing…"),
                SessionStep(.todo, title: "Advertise", detail: "\(seconds) s broadcast"),
                SessionStep(.todo, title: "Handshake", detail: "Keys + amount"),
                SessionStep(.todo, title: "Client approval", detail: "On their iPhone"),
                SessionStep(.todo, title: "Process", detail: "Mock processor"),
            ],
            eyebrow: "SETTINGS", statusText: "Idle",
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · \(seconds) s",
            title: "Settings",
            countdown: Countdown(
                title: "Advertising countdown",
                detail: "After this, advertising stops and the amount resets.",
                choices: [15, 30, 60, 90, 120].map { CountdownChoice(seconds: $0, text: "\($0) s") },
                selectedSeconds: seconds, selectedText: "\(seconds) s", ringSeconds: seconds
            ),
            readOnlyRows: [
                ReadOnlyRow(title: "Advertised name", value: "MIZAN-7F3A"),
                ReadOnlyRow(title: "Currency", value: "Mizan · MZN"),
                ReadOnlyRow(title: "Processor", value: "Mock · manual outcome"),
            ],
            previewCaption: "PREVIEW · FULL RING", doneTitle: "Done"
        ))
    }
}

private struct SettingsPreview: View {
    let entry: (name: String, state: SettingsState)
    let scheme: ColorScheme

    var body: some View {
        SettingsView(state: entry.state, event: { _ in })
            .environment(\.modeSwitch, ModeSwitchConfiguration(
                side: .host, isEnabled: true, onSelect: { _ in }
            ))
            .environment(\.colorScheme, scheme)
            .frame(width: 1194, height: 834)
    }
}

#Preview("s1-settings-15s · light", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[0], scheme: .light)
}
#Preview("s1-settings-15s · dark", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[0], scheme: .dark)
}
#Preview("s1-settings-30s · light", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[1], scheme: .light)
}
#Preview("s1-settings-30s · dark", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[1], scheme: .dark)
}
#Preview("s1-settings-60s · light", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[2], scheme: .light)
}
#Preview("s1-settings-60s · dark", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[2], scheme: .dark)
}
#Preview("s1-settings-90s · light", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[3], scheme: .light)
}
#Preview("s1-settings-90s · dark", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[3], scheme: .dark)
}
#Preview("s1-settings-120s · light", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[4], scheme: .light)
}
#Preview("s1-settings-120s · dark", traits: .sizeThatFitsLayout) {
    SettingsPreview(entry: SettingsState.previews[4], scheme: .dark)
}
