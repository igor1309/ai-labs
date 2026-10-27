import DesignSystem
import Foundation
import ModeSwitchUI
import PreviewKit
import SwiftUI

@main
enum ModeSwitchPreview {
    @MainActor
    static func main() throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.isEmpty {
            ModeSwitchPreviewApp.main()
            return
        }
        guard arguments.count == 2, arguments[0] == "--export" else {
            throw UsageError()
        }
        let folder = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let snapshots = [
            snapshot("host-enabled", side: .host, isEnabled: true),
            snapshot("host-disabled", side: .host, isEnabled: false),
            snapshot("client-enabled", side: .client, isEnabled: true),
            snapshot("client-disabled", side: .client, isEnabled: false),
        ]
        try PreviewExporter.export(snapshots, to: folder)
        print("Exported 16 PNGs to \(folder.path)")
    }

    @MainActor
    private static func snapshot(
        _ name: String, side: Side, isEnabled: Bool
    ) -> PreviewSnapshot<some View> {
        PreviewSnapshot(name) { device in
            ModeSwitchScene(
                state: .init(side: side, isEnabled: isEnabled), device: device,
                event: { _ in }, onSettings: {}
            )
        }
    }

    private struct UsageError: Error, CustomStringConvertible {
        var description: String { "Usage: swift run ModeSwitchPreview [--export <folder>]" }
    }
}

private struct ModeSwitchPreviewApp: App {
    init() { PreviewApp.bringToFront() }

    var body: some Scene {
        WindowGroup("Mode switch") {
            ModeSwitchPreviewWindow()
        }
        .defaultSize(width: 1500, height: 930)
    }
}

private struct ModeSwitchPreviewWindow: View {
    @State private var state = ModeSwitchState(side: .host, isEnabled: true)
    @State private var device: PreviewDeviceSize = .iPad
    @State private var events: [String] = []

    var body: some View {
        PreviewWindow(device: device, events: events, backdrop: { _ in Tokens.rail }) {
            ModeSwitchScene(state: state, device: device) { event in
                switch event {
                case let .choose(side):
                    events.append("Choose \(side == .host ? "Host" : "Client")")
                    state.side = side
                }
            } onSettings: {
                events.append("Open settings")
            }
        } controls: {
            Section("Mode") {
                Picker("Device", selection: $device) {
                    ForEach(PreviewDeviceSize.allCases, id: \.self) { device in
                        Text(device.rawValue).tag(device)
                    }
                }
                Toggle("At rest", isOn: $state.isEnabled)
                Text("Chosen: \(state.side == .host ? "Host" : "Client")")
                Button("Clear event log") { events.removeAll() }
            }
        }
    }
}

private struct ModeSwitchScene: View {
    let state: ModeSwitchState
    let device: PreviewDeviceSize
    let event: (ModeSwitchEvent) -> Void
    let onSettings: () -> Void

    var body: some View {
        ModeSwitchView(state: state, event: event) {
            StandInScreen(side: .host, device: device, isAtRest: state.isEnabled, onSettings: onSettings)
        } client: {
            StandInScreen(side: .client, device: device, isAtRest: state.isEnabled, onSettings: onSettings)
        }
    }
}

private struct StandInScreen: View {
    let side: Side
    let device: PreviewDeviceSize
    let isAtRest: Bool
    let onSettings: () -> Void

    @State private var taps = 0

    var body: some View {
        switch device {
        case .iPad:
            IPadShell(
                side: side, eyebrow: "MODE PREVIEW", status: StatusPill("Stand-in"),
                deviceCode: "MIZAN-7F3A", deviceMeta: "Preview device",
                onSwitch: { _ in }, onSettings: onSettings, isSettingsEnabled: isAtRest
            ) {
                Text("Session steps").typeRole(.small)
            } content: {
                content
            }
        case .iPhone:
            IPhoneShell(
                side: side, eyebrow: "MODE PREVIEW", status: StatusPill("Stand-in"),
                onSwitch: { _ in }
            ) {
                Text("Session steps").typeRole(.small)
            } content: {
                content
            }
        }
    }

    private var content: some View {
        VStack(spacing: Tokens.space5) {
            Text(side == .host ? "Host screen" : "Client screen").typeRole(.title)
            Text("Stand-in content").typeRole(.body)
            Button { taps += 1 } label: {
                Text("Local taps: \(taps)")
                    .typeRole(.body)
                    .padding(Tokens.space3)
                    .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
            }
            .buttonStyle(.plain)
            Text("Switch away and back to reset the counter.").typeRole(.small)
        }
    }
}
