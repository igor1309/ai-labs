import ClientPaymentUI
import DesignSystem
import Foundation
import PreviewKit
import SwiftUI

@main
enum ClientPaymentPreview {
    @MainActor
    static func main() throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.isEmpty {
            ClientPaymentPreviewApp.main()
            return
        }
        guard arguments.count == 2, arguments[0] == "--export" else {
            throw UsageError()
        }
        let folder = URL(fileURLWithPath: arguments[1], isDirectory: true)
        let snapshots = ClientPaymentState.previews.map { preview in
            PreviewSnapshot(preview.name) { _ in
                ClientPaymentView(state: preview.state, event: { _ in })
                    .background(Tokens.rail)
            }
        }
        try PreviewExporter.export(snapshots, to: folder, devices: [.iPhone])
        print("Exported \(snapshots.count * 2) PNGs to \(folder.path)")
    }

    private struct UsageError: Error, CustomStringConvertible {
        var description: String { "Usage: swift run ClientPaymentPreview [--export <folder>]" }
    }
}

private struct ClientPaymentPreviewApp: App {
    init() { PreviewApp.bringToFront() }

    var body: some Scene {
        WindowGroup("Client payment") {
            ClientPaymentPreviewWindow()
        }
        .defaultSize(width: 800, height: 930)
    }
}

private struct ClientPaymentPreviewWindow: View {
    @State private var selection = 0
    @State private var events: [String] = []

    var body: some View {
        PreviewWindow(device: .iPhone, events: events, backdrop: { _ in Tokens.rail }) {
            ClientPaymentView(state: ClientPaymentState.previews[selection].state) { event in
                switch event {
                case .confirm: events.append("Confirm")
                case .decline: events.append("Decline")
                case .done: events.append("Done")
                }
            }
        } controls: {
            Section("State") {
                Picker("Preview", selection: $selection) {
                    ForEach(ClientPaymentState.previews.indices, id: \.self) { index in
                        Text(ClientPaymentState.previews[index].name).tag(index)
                    }
                }
                Button("Clear event log") { events.removeAll() }
            }
        }
    }
}
