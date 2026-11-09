import DesignSystem
import Foundation
import HostUI
import PreviewKit
import SwiftUI

@main
enum HostPreview {
    @MainActor
    static func main() throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.isEmpty {
            HostPreviewApp.main()
            return
        }
        guard arguments.count == 2, arguments[0] == "--export" else {
            throw UsageError()
        }
        let folder = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let snapshots = HostState.previews.map { preview in
            PreviewSnapshot(preview.name) { _ in
                HostPreviewScreen(state: preview.state, event: { _ in })
            }
        }
        try PreviewExporter.export(snapshots, to: folder)
        print("Exported \(snapshots.count * 4) PNGs to \(folder.path)")
    }

    private struct UsageError: Error, CustomStringConvertible {
        var description: String { "Usage: swift run HostPreview [--export <folder>]" }
    }
}

private struct HostPreviewApp: App {
    init() { PreviewApp.bringToFront() }

    var body: some Scene {
        WindowGroup("Host") {
            HostPreviewWindow()
        }
        .defaultSize(width: 1500, height: 930)
    }
}

private struct HostPreviewWindow: View {
    @State private var selection = 0
    @State private var events: [String] = []

    var body: some View {
        PreviewWindow(device: .iPad, events: events, backdrop: { _ in Tokens.rail }) {
            HostPreviewScreen(state: HostState.previews[selection].state, event: { event in
                events.append(String(describing: event))
            }, onSwitch: { side in events.append("Choose \(side)") })
        } controls: {
            Section("Host state") {
                Picker("State", selection: $selection) {
                    ForEach(HostState.previews.indices, id: \.self) { index in
                        Text(HostState.previews[index].name).tag(index)
                    }
                }
                Text("Events are logged; choose a state to change the screen.")
                Button("Clear event log") { events.removeAll() }
            }
        }
    }
}

private struct HostPreviewScreen: View {
    let state: HostState
    let event: (HostEvent) -> Void
    var onSwitch: (Side) -> Void = { _ in }

    var body: some View {
        HostView(state: state, event: event)
            .environment(\.modeSwitch, .init(
                side: .host, isEnabled: state.isSettingsEnabled, onSelect: onSwitch
            ))
            .background(Tokens.rail)
    }
}
