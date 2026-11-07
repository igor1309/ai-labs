import CoreAudioProcesses
import Calls
import Recordings
import Foundation
import CallAudioAccess
import Lifecycle
import MenuBar
import Observation
import PanelUI
import Preferences
import Recording
import SettingsUI

private struct MenuApplication {

    let states: () async -> AsyncStream<RecordingState>
    let failures: AsyncStream<any Error>
    let send: (RecordingEvent) async -> Void
    let quit: () async -> Void
    let reserveStorage: () async -> Bool
    let releaseStorage: () async -> Void
    let panelStates: () async -> AsyncStream<PanelState>
    let sendPanel: (PanelEvent) async -> Void
}

@MainActor @Observable
public final class AudelinMenu {

    public private(set) var calls: AudelinCalls?
    public private(set) var state = RecordingState()
    public var preferences: Preferences { settings.snapshot }
    public private(set) var quitting = false
    public private(set) var panelState = PanelState(recording: .off, log: .empty)
    private(set) var panelPresence = PanelPresence()
    public private(set) var summarySettings: AudelinSettings?
    private var folderSettings: AudelinFolderSettings?
    private var chooseFolder: () async -> URL? = { nil }
    private var summaries: AudelinSummaries?
    private var presentSettings: () -> Void = {}
    private let presentPanel: (Bool) -> Void
    private let sleep: @Sendable (Duration) async throws -> Void
    private let sendPanelEvent: (PanelEvent) async -> Void
    private var panelObservation: Task<Void, Never>?
    private var hideDelay: Task<Void, Never>?
    private var failure: String?
    private let sink: any LogSink
    private let settings: PreferenceSettings
    private let recordingStates: () async -> AsyncStream<RecordingState>
    private let panels: () async -> AsyncStream<PanelState>
    private let send: (RecordingEvent) async -> Void
    private let openFolder: (URL) -> Void
    private let openURL: (URL) -> Void
    private let reserveStorage: () async -> Bool
    private let releaseStorage: () async -> Void
    private let quit: () async -> Void
    private var observation: Task<Void, Never>?
    private var detectionObservation: Task<Void, Never>?

    public var menu: MenuBarModel {
        MenuBarModel(recording: menuBarRecording(state), preferences: menuBarPreferences(preferences), statusLine: failure,
                     offersPanelReopen: panelPresence.offersReopen, panelVisible: panelPresence.visible)
    }

    init(
        storage: PreferencesStore,
        boundary: ComposerBoundary,
        processes: CoreAudioProcesses,
        panel: AudelinPanel,
        openFolder: @escaping (URL) -> Void,
        openURL: @escaping (URL) -> Void,
        terminate: @escaping @Sendable () async -> Void,
        sink: any LogSink,
        presentPanel: @escaping (Bool) -> Void,
        sleep: @escaping @Sendable (Duration) async throws -> Void,
        summaries: AudelinSummaries? = nil
    ) async {

        self.sink = sink
        self.summaries = summaries
        self.presentPanel = presentPanel
        self.sleep = sleep
        let application: MenuApplication?
        do {
            let recording = try await AudelinRecording(preferences: storage, boundary: boundary,
                                                       processes: processes, panel: panel, summaries: summaries?.callbacks(timeZone: boundary.time.timeZone()) ?? .disabled)
            application = MenuApplication(
                states: { await recording.inputs.states() }, failures: recording.detectionFailures,
                send: { await recording.inputs.send($0) },
                quit: { await Composer.quit(recording.lifecycle(terminate: {
                    await summaries?.shutdown()
                    await terminate()
                })) },
                reserveStorage: { await recording.reserveStorage() }, releaseStorage: { await recording.releaseStorage() },
                panelStates: { await recording.panel.states() },
                sendPanel: { await recording.panel.send($0) }
            )
        } catch {
            sink.write(.init(category: .menu, message: "startup failed", error: String(describing: error)))
            application = nil
            failure = "Не удалось начать наблюдение за звонками: \(error)"
        }
        let send = application?.send ?? { _ in }
        settings = PreferenceSettings(storage: storage, automaticChanged: { await send(.automaticChanged($0)) })
        self.recordingStates = application?.states ?? { AsyncStream { $0.finish() } }
        self.panels = application?.panelStates ?? { AsyncStream { $0.finish() } }
        self.send = send
        self.openFolder = openFolder
        self.openURL = openURL
        self.reserveStorage = application?.reserveStorage ?? { false }
        self.releaseStorage = application?.releaseStorage ?? {}
        self.quit = application?.quit ?? { await summaries?.shutdown(); await terminate() }
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
                    self.calls?.recordingChanged(state)
                    self.receivePanelPresence(.recordingChanged(panelRecordingID(state)))
                    sink.write(.init(category: .menu, message: "item symbol=\(self.menu.item.symbol) red=\(self.menu.item.isRed)"))
                }
            }
            detectionObservation = Task { [weak self, failures = application.failures] in
                for await error in failures {
                    guard let self else { return }
                    sink.write(.init(category: .menu, message: "detection failed", error: String(describing: error)))
                    self.failure = "Наблюдение за звонками остановлено: \(error)"
                }
            }
        }
    }

    func installFolderSettings(storage: SummaryStorage, preferences: PreferencesStore, choose: @escaping () async -> URL?) {
        chooseFolder = choose
        folderSettings = AudelinFolderSettings(handler: .init(reserve: { [weak self] in await self?.reserveStorage() ?? false }, release: { [weak self] in await self?.releaseStorage() },
            move: { [weak self] destination in
                try await storage.move(to: destination, commit: { try preferences.updateCallsFolder(destination) })
                self?.calls?.show()
            }))
    }

    func installSettings(_ model: AudelinSettings, present: @escaping () -> Void) {
        summarySettings = model; presentSettings = present
    }

    public var settingsState: SettingsState {
        var result = SettingsState(recordsCalls: preferences.automaticRecording, liveText: preferences.liveText,
                      folder: .init(path: settings.callsFolder.path, status: state.phase == .idle ? .idle(calls: "") : .recording),
                      engines: [.init(id: "parakeet", name: "Parakeet v3", note: "Локальное распознавание", availability: "", size: "")],
                      selectedEngine: "parakeet", explainKeys: "", selectedTab: summarySettings?.selectedTab ?? .recording,
                      callNotes: summarySettings?.notes ?? .loading("Загружаем настройки…"))
        if let move = folderSettings?.state {
            switch move.phase {
            case .confirming:
                result.moveConfirm = .init(title: "Перенести звонки?", body: "В \(move.destination?.path ?? ""). Во время переноса запись не начнётся.")
            case .moving: result.folder.status = .moving(done: 0, detail: "Переносим звонки…")
            case .failed: result.folder.status = .failed(moved: "Перенос не завершён", reason: "Часть звонков могла переехать. Проверьте папку и повторите; готовые итоги сохраняются по текущему адресу звонка.")
            case .idle: break
            }
        }
        return result
    }
    public func sendSettings(_ event: SettingsEvent) async {
        guard !quitting else { return }
        switch event {
        case .changeFolder:
            if state.phase == .idle, let destination = await chooseFolder() { folderSettings?.send(.choose(destination)) }
        case .confirmMove, .retryMove: folderSettings?.send(.confirm)
        case .cancelMove: folderSettings?.send(.cancel)
        case let .setRecordsCalls(value): await perform(.setAutomatic(value))
        case let .setLiveText(value): await perform(.setLiveText(value))
        default: summarySettings?.send(event)
        }
    }

    func installCalls(_ calls: AudelinCalls) {
        self.calls = calls
        calls.recordingChanged(state)
    }

    public func summaryStates() -> AsyncStream<[String: String]> {
        summaries?.updates() ?? AsyncStream { $0.finish() }
    }

    public func states() async -> AsyncStream<RecordingState> { await recordingStates() }

    public func panelStates() async -> AsyncStream<PanelState> { await panels() }

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
        case .showCalls: calls?.show()
        case .showSettings: presentSettings()
        case .showPanel: receivePanelPresence(.reopen)
        case .hidePanel: receivePanelPresence(.userClosed)
        case .openCallsFolder: openFolder(settings.callsFolder)
        case .quit:
            quitting = true
            summaries?.stopDispatch()
            await folderSettings?.drain()
            await quit()
        }
    }

    public func panelClosed() { receivePanelPresence(.userClosed) }

    public func appReopened() {

        guard !quitting else { return }
        receivePanelPresence(.appReopen)
    }

    public func sendPanel(_ event: PanelEvent) async {

        switch event {
        case .start: await perform(.start)
        case .stop: await perform(.stop)
        case .openCallsFolder: await perform(.openCallsFolder)
        case let .openSettings(pane):
            let name = pane == .microphone ? "Privacy_Microphone" : "Privacy_ScreenCapture"
            openURL(URL(string: "x-apple.systempreferences:com.apple.preference.security?\(name)")!)
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
            case .showCalls:
                calls?.show()
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
