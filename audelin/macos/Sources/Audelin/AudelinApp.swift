import AppKit
import SwiftUI

@main
struct AudelinApp: App {
    var body: some Scene {
        MenuBarExtra("Audelin", systemImage: "waveform") {
            Button("Выйти") { quit() }
                .keyboardShortcut("q")
        }
    }

    private func quit() {
        if QuitPolicy.answer(recording: false, moving: false) == .quit {
            NSApplication.shared.terminate(nil)
        }
    }
}
