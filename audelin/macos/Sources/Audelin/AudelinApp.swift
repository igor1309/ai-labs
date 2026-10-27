import AppKit
import Compose
import Preferences
import Recording
import SwiftUI

@main
struct AudelinApp: App {

    @State private var model = MenuBarModel()

    var body: some Scene {
        MenuBarExtra {
            Text(model.stateLine)
            Divider()
            Button("Открыть папку звонков") { model.openCallsFolder() }
            Button("Выйти") { model.quit() }
                .keyboardShortcut("q")
                .disabled(model.quitting)
        } label: {
            Label(model.item.title, systemImage: model.item.symbol)
                .foregroundStyle(model.state.phase == .idle ? Color.primary : .red)
        }
    }
}

@MainActor @Observable
private final class MenuBarModel {

    var state = RecordingState()
    var quitting = false
    private var failure: String?
    private let preferences: PreferencesStore
    private let application: AudelinRecording?
    private var observation: Task<Void, Never>?
    private var detectionObservation: Task<Void, Never>?

    var item: MenuBarItem { .from(state, liveText: preferences.read().liveText) }
    var stateLine: String { failure ?? item.stateLine }

    init() {

        let preferences = PreferencesStore(fileURL: FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".audelin/preferences.json"))
        self.preferences = preferences
        do {
            let application = try AudelinRecording(preferences: preferences)
            self.application = application
            observation = Task { [weak self, recording = application.recording] in
                for await state in await recording.states() {
                    guard let self else { return }
                    self.state = state
                }
            }
            detectionObservation = Task { [weak self, failures = application.detectionFailures] in
                for await error in failures {
                    guard let self else { return }
                    self.failure = "Наблюдение за звонками остановлено: \(error)"
                }
            }
        } catch {
            application = nil
            failure = "Не удалось начать наблюдение за звонками: \(error)"
        }
    }

    func openCallsFolder() {

        NSWorkspace.shared.open(preferences.read().callsFolder)
    }

    func quit() {

        guard !quitting else { return }
        quitting = true
        Task {
            if let application {
                await application.quit {
                    await MainActor.run { NSApplication.shared.terminate(nil) }
                }
            } else {
                NSApplication.shared.terminate(nil)
            }
        }
    }

    isolated deinit {

        observation?.cancel()
        detectionObservation?.cancel()
    }
}
