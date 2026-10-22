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

    /// Nothing records or moves yet, so the answer is always to quit.
    private func quit() {
        if QuitPolicy.answer(recording: false, moving: false) == .quit {
            NSApplication.shared.terminate(nil)
        }
    }
}
