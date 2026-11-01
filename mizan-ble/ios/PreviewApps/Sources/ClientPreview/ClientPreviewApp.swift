import ClientUI
import DesignSystem
import Foundation
import PreviewKit
import SwiftUI

@main
enum ClientPreview {
    @MainActor
    static func main() throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.isEmpty {
            ClientPreviewApp.main()
            return
        }
        guard arguments.count == 2, arguments[0] == "--export" else {
            throw UsageError()
        }
        let folder = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let snapshots = ClientState.previews.map { preview in
            PreviewSnapshot(preview.name) { _ in
                ClientPreviewScene(state: preview.state, event: { _ in })
            }
        }
        try PreviewExporter.export(snapshots, to: folder, devices: [.iPhone])
        print("Exported \(snapshots.count * 2) PNGs to \(folder.path)")
    }

    private struct UsageError: Error, CustomStringConvertible {
        var description: String { "Usage: swift run ClientPreview [--export <folder>]" }
    }
}

private struct ClientPreviewApp: App {
    init() { PreviewApp.bringToFront() }

    var body: some Scene {
        WindowGroup("Client") {
            ClientPreviewWindow()
        }
        .defaultSize(width: 760, height: 930)
    }
}

private struct ClientPreviewWindow: View {
    @State private var selected = 0
    @State private var events: [String] = []

    var body: some View {
        PreviewWindow(device: .iPhone, events: events, backdrop: { _ in Tokens.rail }) {
            ClientPreviewScene(state: ClientState.previews[selected].state) { event in
                switch event {
                case .startHandshake: events.append("Start handshake")
                case .cancel: events.append("Cancel")
                case .tryAgain: events.append("Try again")
                }
            }
        } controls: {
            Section("Client state") {
                Picker("Preview", selection: $selected) {
                    ForEach(ClientState.previews.indices, id: \.self) { index in
                        Text(ClientState.previews[index].name).tag(index)
                    }
                }
                Text("Events are logged; choose a preview to change the screen.")
                Button("Clear event log") { events.removeAll() }
            }
        }
    }
}

private struct ClientPreviewScene: View {
    let state: ClientState
    let event: (ClientEvent) -> Void

    var body: some View {
        ClientView(state: state, event: event)
            .background(Tokens.rail)
    }
}
