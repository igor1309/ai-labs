import Foundation
import MenuBar
import Observation
import Preferences
import Recording

@MainActor @Observable
public final class AudelinMenu {

    public private(set) var state = RecordingState()
    public private(set) var preferences: Preferences
    public private(set) var quitting = false
    private var failure: String?
    private let readPreferences: () -> Preferences
    private let writePreferences: (Preferences) throws -> Void
    private let send: (RecordingEvent) -> Void
    private let openFolder: (URL) -> Void
    private let quit: () async -> Void
    private var observation: Task<Void, Never>?
    private var detectionObservation: Task<Void, Never>?

    public var menu: MenuBarModel {
        MenuBarModel(state: state, preferences: preferences, statusLine: failure)
    }

    public convenience init(
        preferences: PreferencesStore,
        openCallsFolder: @escaping (URL) -> Void,
        terminate: @escaping @Sendable () async -> Void
    ) {

        do {
            let application = try AudelinRecording(preferences: preferences)
            self.init(
                readPreferences: { preferences.read() }, writePreferences: { try preferences.write($0) },
                send: { application.recording.send($0) }, openFolder: openCallsFolder,
                quit: { await application.quit(terminate: terminate) }
            )
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
            self.init(
                readPreferences: { preferences.read() }, writePreferences: { try preferences.write($0) },
                send: { _ in }, openFolder: openCallsFolder, quit: { await terminate() }
            )
            failure = "Не удалось начать наблюдение за звонками: \(error)"
        }
    }

    init(
        readPreferences: @escaping () -> Preferences,
        writePreferences: @escaping (Preferences) throws -> Void,
        send: @escaping (RecordingEvent) -> Void,
        openFolder: @escaping (URL) -> Void,
        quit: @escaping () async -> Void
    ) {

        self.readPreferences = readPreferences
        self.writePreferences = writePreferences
        self.send = send
        self.openFolder = openFolder
        self.quit = quit
        preferences = readPreferences()
    }

    public func perform(_ action: MenuBarAction) async {

        guard !quitting else { return }
        switch action {
        case .start: send(.userStart)
        case .stop: send(.userStop)
        case let .setAutomatic(enabled):
            if updatePreferences({ $0.automaticRecording = enabled }) {
                send(.automaticChanged(enabled))
            }
        case let .setLiveText(enabled):
            _ = updatePreferences { $0.liveText = enabled }
        case .openCallsFolder: openFolder(readPreferences().callsFolder)
        case .quit:
            quitting = true
            await quit()
        }
    }

    private func updatePreferences(_ update: (inout Preferences) -> Void) -> Bool {

        var updated = readPreferences()
        update(&updated)
        do {
            try writePreferences(updated)
            preferences = updated
            return true
        } catch {
            return false
        }
    }

    isolated deinit {

        observation?.cancel()
        detectionObservation?.cancel()
    }
}
