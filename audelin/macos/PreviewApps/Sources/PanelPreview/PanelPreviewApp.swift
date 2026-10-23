import GlassLedger
import PanelUI
import PreviewKit
import SwiftUI

/// The live panel driven by a scripted call, to try it by hand.
@main
struct PanelPreviewApp: App {

    init() { PreviewApp.bringToFront() }

    var body: some Scene {

        WindowGroup("Panel") {

            PanelPreviewView()
        }
        .defaultSize(width: 780, height: 760)
    }
}

struct PanelPreviewView: View {

    @State private var call = FakeCall(loops: true)
    @State private var isPlaying = true
    @State private var stepSeconds = 2.0

    var body: some View {

        PreviewWindow(backdrop: { GlassLedger.for($0).back }) {

            PanelView(state: call.state, event: { call.handle($0) })

        } controls: {

            Section("Call") {

                Toggle("Play", isOn: $isPlaying)
                    .disabled(!call.isRecording || call.isFinished)

                Button("Step") { call.step() }
                    .disabled(!call.isRecording || call.isFinished)

                Picker("Step every", selection: $stepSeconds) {
                    Text("0.5 s").tag(0.5)
                    Text("2 s").tag(2.0)
                    Text("4 s").tag(4.0)
                }

                Toggle("Live text", isOn: Binding(
                    get: { call.liveText },
                    set: { call.setLiveText($0) }
                ))

                if call.isFinished {
                    Text("The script has ended; Стоп, then Начать, to replay.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .task(id: Ticking(isOn: isPlaying && call.isRecording, seconds: stepSeconds)) {

            guard isPlaying, call.isRecording else { return }

            while !Task.isCancelled, !call.isFinished {

                try? await Task.sleep(for: .seconds(stepSeconds))
                if !Task.isCancelled { call.step() }
            }
        }
    }

    private struct Ticking: Equatable {

        var isOn: Bool
        var seconds: Double
    }
}
