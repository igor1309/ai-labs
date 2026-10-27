import Foundation
import MenuBar
import Observation
import Preferences
import Recording

struct MenuApplication {

    let states: () async -> AsyncStream<RecordingState>
    let failures: AsyncStream<any Error>
    let send: (RecordingEvent) -> Void
    let quit: () async -> Void
}

@MainActor @Observable
public final class AudelinMenu {

    public private(set) var state = RecordingState()
    public var preferences: Preferences { settings.snapshot }
    public private(set) var quitting = false
    private var failure: String?
    private let sink: any LogSink
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

        self.init(
            storage: preferences,
            makeApplication: {
                let application = try AudelinRecording(preferences: preferences)
                return MenuApplication(
                    states: { await application.recording.states() },
                    failures: application.detectionFailures,
                    send: { application.recording.send($0) },
                    quit: { await application.quit(terminate: terminate) }
                )
            },
            openFolder: openCallsFolder, terminate: { await terminate() }, didDeliver: {}
        )
    }

    // Delivery is acknowledged after the observable state or failure has been updated.
    init(
        storage: any PreferenceSettingsStorage,
        makeApplication: () throws -> MenuApplication,
        openFolder: @escaping (URL) -> Void,
        terminate: @escaping () async -> Void,
        didDeliver: @escaping () -> Void,
        sink: any LogSink = SystemLogSink()
    ) {

        self.sink = sink
        let application: MenuApplication?
        do {
            application = try makeApplication()
        } catch {
            sink.write(.init(category: .menu, message: "startup failed", error: String(describing: error)))
            application = nil
            failure = "Не удалось начать наблюдение за звонками: \(error)"
        }
        let send = application?.send ?? { _ in }
        settings = PreferenceSettings(storage: storage, automaticChanged: { send(.automaticChanged($0)) })
        self.send = send
        self.openFolder = openFolder
        self.quit = application?.quit ?? terminate
        if let application {
            observation = Task { [weak self, states = application.states] in
                for await state in await states() {
                    guard let self else { return }
                    StateLog(sink: sink).recording(state)
                    self.state = state
                    sink.write(.init(category: .menu, message: "item symbol=\(self.menu.item.symbol) red=\(self.menu.item.isRed)"))
                    didDeliver()
                }
            }
            detectionObservation = Task { [weak self, failures = application.failures] in
                for await error in failures {
                    guard let self else { return }
                    sink.write(.init(category: .menu, message: "detection failed", error: String(describing: error)))
                    self.failure = "Наблюдение за звонками остановлено: \(error)"
                    didDeliver()
                }
            }
        }
    }

    /// Waits for both observers after their input streams finish.
    func waitForObservers() async {

        await observation?.value
        await detectionObservation?.value
    }

    public func perform(_ action: MenuBarAction) async {

        guard !quitting else { return }
        sink.write(.init(category: .menu, message: "action=\(action)"))
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
