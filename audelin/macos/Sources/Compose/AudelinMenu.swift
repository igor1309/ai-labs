import Foundation
import Lifecycle
import MenuBar
import Observation
import PanelUI
import Preferences
import Recording

struct MenuApplication {

    let states: () async -> AsyncStream<RecordingState>
    let failures: AsyncStream<any Error>
    let send: (RecordingEvent) async -> Void
    let quit: () async -> Void
    let panelStates: () async -> AsyncStream<PanelState>
    let sendPanel: (PanelEvent) async -> Void
}

@MainActor @Observable
public final class AudelinMenu {

    public private(set) var state = RecordingState()
    public var preferences: Preferences { settings.snapshot }
    public private(set) var quitting = false
    public private(set) var panelState = PanelState(recording: .off, log: .empty)
    private(set) var panelPresence = PanelPresence()
    private let presentPanel: (Bool) -> Void
    private let sleep: @Sendable (Duration) async throws -> Void
    private let sendPanelEvent: (PanelEvent) async -> Void
    private var panelObservation: Task<Void, Never>?
    private var hideDelay: Task<Void, Never>?
    private var failure: String?
    private let sink: any LogSink
    private let settings: PreferenceSettings
    private let send: (RecordingEvent) async -> Void
    private let openFolder: (URL) -> Void
    private let quit: () async -> Void
    private var observation: Task<Void, Never>?
    private var detectionObservation: Task<Void, Never>?

    public var menu: MenuBarModel {
        MenuBarModel(recording: menuBarRecording(state), preferences: menuBarPreferences(preferences), statusLine: failure,
                     offersPanelReopen: panelPresence.offersReopen)
    }

    public convenience init(
        preferences: PreferencesStore,
        openCallsFolder: @escaping (URL) -> Void,
        presentPanel: @escaping (Bool) -> Void,
        terminate: @escaping @Sendable () async -> Void,
        quit: @escaping (LifecycleEffectHandler) async -> Void,
        makeReading: @escaping @MainActor @Sendable () -> ReadingInputs
    ) async {

        await self.init(
            storage: preferences,
            makeApplication: {
                let application = try await AudelinRecording(preferences: preferences, makeReading: makeReading)
                return MenuApplication(
                    states: { await application.inputs.states() },
                    failures: application.detectionFailures,
                    send: { await application.inputs.send($0) },
                    quit: { await quit(application.lifecycle(terminate: terminate)) },
                    panelStates: { await application.panel.states() },
                    sendPanel: { await application.panel.send($0) }
                )
            },
            openFolder: openCallsFolder, terminate: { await terminate() }, didDeliver: {}, sink: SystemLogSink(),
            presentPanel: presentPanel, sleep: { try await ContinuousClock().sleep(for: $0) }
        )
    }

    // Delivery is acknowledged after the observable state or failure has been updated.
    init(
        storage: any PreferenceSettingsStorage,
        makeApplication: () async throws -> MenuApplication,
        openFolder: @escaping (URL) -> Void,
        terminate: @escaping () async -> Void,
        didDeliver: @escaping () -> Void,
        sink: any LogSink,
        presentPanel: @escaping (Bool) -> Void,
        sleep: @escaping @Sendable (Duration) async throws -> Void
    ) async {

        self.sink = sink
        self.presentPanel = presentPanel
        self.sleep = sleep
        let application: MenuApplication?
        do {
            application = try await makeApplication()
        } catch {
            sink.write(.init(category: .menu, message: "startup failed", error: String(describing: error)))
            application = nil
            failure = "Не удалось начать наблюдение за звонками: \(error)"
        }
        let send = application?.send ?? { _ in }
        settings = PreferenceSettings(storage: storage, automaticChanged: { await send(.automaticChanged($0)) })
        self.send = send
        self.openFolder = openFolder
        self.quit = application?.quit ?? terminate
        self.sendPanelEvent = application?.sendPanel ?? { _ in }
        if let application {
            panelObservation = Task { [weak self, states = application.panelStates] in
                for await state in await states() {
                    guard let self else { return }
                    self.panelState = state
                }
            }
            observation = Task { [weak self, states = application.states] in
                for await state in await states() {
                    guard let self else { return }
                    self.state = state
                    self.receivePanelPresence(.recordingChanged(panelRecordingID(state)))
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

    /// Waits for state and failure delivery after their input streams finish.
    func waitForObservers() async {

        await observation?.value
        await detectionObservation?.value
        await panelObservation?.value
    }

    public func perform(_ action: MenuBarAction) async {

        guard !quitting else { return }
        sink.write(.init(category: .menu, message: "action=\(action)"))
        switch action {
        case .start: await send(.userStart)
        case .stop: await send(.userStop)
        case let .setAutomatic(enabled):
            await settings.setAutomatic(enabled)
        case let .setLiveText(enabled):
            settings.setLiveText(enabled)
        case .showPanel: receivePanelPresence(.reopen)
        case .openCallsFolder: openFolder(settings.callsFolder)
        case .quit:
            quitting = true
            await quit()
        }
    }

    public func panelClosed() { receivePanelPresence(.userClosed) }

    public func sendPanel(_ event: PanelEvent) async {

        switch event {
        case .start: await perform(.start)
        case .stop: await perform(.stop)
        default: await sendPanelEvent(event)
        }
    }

    private func receivePanelPresence(_ event: PanelPresence.Event) {

        let (next, effects) = PanelPresence.reduce(panelPresence, event)
        panelPresence = next
        for effect in effects {
            switch effect {
            case let .show(reason):
                presentPanel(true)
                sink.write(.init(category: .panel, message: "shown reason=\(reason.rawValue)"))
            case let .hide(reason):
                presentPanel(false)
                sink.write(.init(category: .panel, message: "hidden reason=\(reason.rawValue)"))
            case .cancelDelay:
                hideDelay?.cancel()
                hideDelay = nil
            case let .hideAfter(seconds, generation):
                hideDelay = Task { [weak self, sleep] in
                    do {
                        try await sleep(.seconds(seconds))
                        guard !Task.isCancelled else { return }
                        self?.receivePanelPresence(.delayElapsed(generation))
                    } catch {}
                }
            }
        }
    }

    isolated deinit {

        hideDelay?.cancel()
        panelObservation?.cancel()
        observation?.cancel()
        detectionObservation?.cancel()
    }
}

private func panelRecordingID(_ state: RecordingState) -> UInt64? {

    switch state.phase {
    case .beginning, .recording, .ending: state.session?.id
    case .idle: nil
    }
}
