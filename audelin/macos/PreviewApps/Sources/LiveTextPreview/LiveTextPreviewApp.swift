import AppKit
import GlassLedger
import PanelUI
import PreviewKit
import SwiftUI
import UniformTypeIdentifiers

/// The live panel fed by the real recognisers and Live text, to try them by
/// hand on the microphone or a recorded call.
@main
struct LiveTextPreviewApp: App {

    init() { PreviewApp.bringToFront() }

    var body: some Scene {

        WindowGroup("Live text") {

            LiveTextPreviewView()
        }
        .defaultSize(width: 780, height: 760)
    }
}

struct LiveTextPreviewView: View {

    @State private var call = LiveCall()

    var body: some View {

        PreviewWindow(backdrop: { GlassLedger.for($0).back }) {

            TimelineView(.periodic(from: .now, by: 1)) { _ in
                PanelView(state: call.state(at: .now), event: { call.handle($0) })
            }

        } controls: {

            Section("Recogniser") {

                Picker("Model", selection: $call.model) {
                    ForEach(LiveCall.Model.allCases) { Text($0.rawValue).tag($0) }
                }
                Picker("Pause", selection: $call.pause) {
                    Text("2 s").tag(2.0)
                    Text("Off").tag(1000.0)
                }
            }
            .disabled(call.isRecording)

            Section("Audio") {

                Picker("Source", selection: $call.source) {
                    Text("Microphone").tag(LiveCall.Source.microphone)
                    if case let .file(url) = call.source {
                        Text(url.lastPathComponent).tag(call.source)
                    }
                }
                Button("Choose a recording…") { chooseFile() }
                Text("A stereo file is read as Amanu keeps a call: the left channel «я», the right «они», played at its pace.")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            }
            .disabled(call.isRecording)

            Section("Status") {

                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    Text(call.status(at: .now))
                }
                Text("Log: \(Log.file.path)")
                    .foregroundStyle(.secondary)
                    .font(.caption)
                    .textSelection(.enabled)
            }
        }
        .task { call.prepare() }
        .onChange(of: call.model) { call.prepare() }
    }

    private func chooseFile() {

        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        if panel.runModal() == .OK, let url = panel.url { call.source = .file(url) }
    }
}
