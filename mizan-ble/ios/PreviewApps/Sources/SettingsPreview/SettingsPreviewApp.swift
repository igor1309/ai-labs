import DesignSystem
import Foundation
import PreviewKit
import SettingsUI
import SwiftUI

@main
enum SettingsPreview {
    @MainActor
    static func main() throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.isEmpty {
            SettingsPreviewApp.main()
            return
        }
        guard arguments.count == 2, arguments[0] == "--export" else {
            throw UsageError()
        }
        let folder = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let snapshots = SettingsState.previews.map { entry in
            PreviewSnapshot(entry.name) { _ in
                SettingsView(state: entry.state, event: { _ in })
                    .background(Tokens.rail)
            }
        }
        try PreviewExporter.export(snapshots, to: folder)
        print("Exported \(snapshots.count * 4) PNGs to \(folder.path)")
    }

    private struct UsageError: Error, CustomStringConvertible {
        var description: String { "Usage: swift run SettingsPreview [--export <folder>]" }
    }
}

private struct SettingsPreviewApp: App {
    init() { PreviewApp.bringToFront() }

    var body: some Scene {
        WindowGroup("Settings") {
            SettingsPreviewWindow()
        }
        .defaultSize(width: 1500, height: 930)
    }
}

private struct SettingsPreviewWindow: View {
    @State private var selection = SettingsState.previews.firstIndex {
        $0.state.countdown.selectedSeconds == 60
    } ?? 0
    @State private var events: [String] = []

    var body: some View {
        PreviewWindow(device: .iPad, events: events, backdrop: { _ in Tokens.rail }) {
            SettingsView(state: SettingsState.previews[selection].state) { event in
                switch event {
                case let .chooseCountdown(seconds):
                    events.append("chooseCountdown(\(seconds))")
                case .done:
                    events.append("done")
                }
            }
        } controls: {
            Section("Settings state") {
                Picker("Preview", selection: $selection) {
                    ForEach(SettingsState.previews.indices, id: \.self) { index in
                        Text(SettingsState.previews[index].name).tag(index)
                    }
                }
                Text("Events are logged; choose a preview to change the screen.")
                    .foregroundStyle(.secondary)
                Button("Clear event log") { events.removeAll() }
            }
        }
    }
}
