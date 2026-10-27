import Foundation
import MenuBar
import Observation
import Preferences
import Recording

@MainActor @Observable
public final class AudelinMenu {

    public private(set) var state = RecordingState()
    public var preferences: Preferences { settings.snapshot }
    public private(set) var quitting = false
    private var failure: String?
    private let settings: PreferenceSettings
    private let send: (RecordingEvent) -> Void
    private let openFolder: (URL) -> Void
    private let quit: () async -> Void
    private var observation: Task<Void, Never>?
    private var detectionObservation: Task<Void, Never>?

    public var menu: MenuBarModel {
        MenuBarModel(recording: menuBarRecording(state), preferences: menuBarPreferences(preferences), statusLine: failure)
    }

    public convenience init(
        preferences: PreferencesStore,
        openCallsFolder: @escaping (URL) -> Void,
        terminate: @escaping @Sendable () async -> Void
    ) {

        do {
            let application = try AudelinRecording(preferences: preferences)
            self.init(
                storage: preferences,
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
                storage: preferences,
                send: { _ in }, openFolder: openCallsFolder, quit: { await terminate() }
            )
            failure = "Не удалось начать наблюдение за звонками: \(error)"
        }
    }

    init(
        storage: any PreferenceSettingsStorage,
        send: @escaping (RecordingEvent) -> Void,
        openFolder: @escaping (URL) -> Void,
        quit: @escaping () async -> Void
    ) {

        settings = PreferenceSettings(storage: storage, automaticChanged: { send(.automaticChanged($0)) })
        self.send = send
        self.openFolder = openFolder
        self.quit = quit
    }

    public func perform(_ action: MenuBarAction) async {

        guard !quitting else { return }
        switch action {
        case .start: send(.userStart)
        case .stop: send(.userStop)
        case let .setAutomatic(enabled):
            settings.setAutomatic(enabled)
        case let .setLiveText(enabled):
            settings.setLiveText(enabled)
        case .openCallsFolder: openFolder(settings.callsFolder)
        case .quit:
            quitting = true
            await quit()
        }
    }

    isolated deinit {

        observation?.cancel()
        detectionObservation?.cancel()
    }
}
