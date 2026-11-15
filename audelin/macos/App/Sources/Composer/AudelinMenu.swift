import CoreAudioProcesses
import Calls
import Recordings
import Foundation
import CallAudioAccess
import IMRxObservation
import Lifecycle
import MenuBar
import Observation
import PanelUI
import Preferences
import Recording
import SettingsUI
import CallsListUI
import SummaryPreviewUI

private struct MenuApplication {

    let states: () async -> AsyncStream<RecordingState>
    let failures: AsyncStream<any Error>
    let send: (RecordingEvent) async -> Void
    let stopDelivery: () async -> Void
    let end: @Sendable () async -> Void
    let storageMoving: (Bool) async -> Void
    let panelStates: () async -> AsyncStream<PanelState>
    let sendPanel: (PanelEvent) async -> Void
}

@MainActor @Observable
public final class AudelinMenu {

    public private(set) var calls: AudelinCalls?
    public private(set) var state = RecordingState()
    public var preferences: Preferences {
        var value = settings.snapshot
        value.callsFolder = settings.callsFolder
        return value
    }
    public private(set) var quitting = false
    public private(set) var panelState = PanelState(recording: .off, log: .empty)
    /// The panel's presence, composed once the menu can show the calls list.
    @ObservationIgnored private var presence: PanelPresenceModel!
    var panelPresence: PanelPresence { presence.state }
    public private(set) var summarySettings: AudelinSettings?
    private var chooseFolder: () async throws -> URL? = { nil }
    private var pickerFailed = false
    private let finalization: TranscriptFinalizationModel
    private var summaries: SummariesModel?
    private var presentSettings: () -> Void = {}
    private let sendPanelEvent: (PanelEvent) async -> Void
    private var panelObservation: Task<Void, Never>?
    /// What stopped call watching, written in the menu's language when shown.
    private var failure: (phrase: MenuBarPhrase, reason: String)?
    private let sink: any LogSink
    private let settings: PreferenceSettings
    private let recordingStates: () async -> AsyncStream<RecordingState>
    private let panels: () async -> AsyncStream<PanelState>
    private let send: (RecordingEvent) async -> Void
    private let openFolder: (URL) -> Void
    private let openURL: (URL) -> Void
    private let storageMoving: (Bool) async -> Void
    private let termination: ObservableModel<TerminationState, TerminationEvent, TerminationEffect>
    private var shutdownObservation: Task<Void, Never>?
    private let pendingRelaunch = PendingRelaunch()
    private var blockerObservation: Task<Void, Never>?
    private var finalizationSubscriptions: [Task<Void, Never>] = []
    private var observation: Task<Void, Never>?
    private var detectionObservation: Task<Void, Never>?
    private var updateWatch: Task<Void, Never>?
    private var choosingFolder = false
    private let panel: AudelinPanel
    /// The language machines read when they write text.
    let currentLanguage: CurrentLanguage
    /// The language Audelin's text is shown in.
    public private(set) var language: UILanguage
    /// What the person picked in General, which `language` resolves.
    private var languageChoice: LanguageChoice
    private let preferredLanguages: @Sendable () -> [String]
    private let saveLanguage: (Preferences.Language) throws -> Void
    /// Light, dark or following macOS, for every window, the panel and the menu bar UI.
    public private(set) var appearance: Preferences.Appearance
    private let saveAppearance: (Preferences.Appearance) throws -> Void
    private var menuText: MenuBarText { MenuBarText(language: language.menuBar) }
    /// Settings' text, in the language Audelin is shown in.
    public var settingsText: SettingsText { language.settings }
    /// The calls list's text, in the language Audelin is shown in.
    public var callsListText: CallsListText { language.callsList }
    /// The notes preview's text, in the language Audelin is shown in.
    public var previewText: SummaryPreviewText { language.preview }
    /// The panel's text, in the language Audelin is shown in.
    public var panelText: PanelText { PanelText(language: language.panel) }

    public var menu: MenuBarModel {
        MenuBarModel(text: menuText.callAsFunction, recording: menuBarRecording(state),
                     preferences: menuBarPreferences(preferences),
                     statusLine: failure.map { String(format: menuText($0.phrase), $0.reason) },
                     offersPanelReopen: panelPresence.offersReopen, panelVisible: panelPresence.visible)
    }

    /// Shows all of Audelin's text in the new language at once.
    public func languageChanged(_ language: UILanguage) async {
        guard language != self.language else { return }
        currentLanguage.language = language
        self.language = language
        summarySettings?.languageChanged()
        calls?.languageChanged(callsListText)
        summaries?.languageChanged(callsListText)
        await panel.languageChanged(panelText)
    }

    init(
        storage: PreferencesStore,
        folderClaim: RecordingFolderClaim,
        relaunchClaim: RelaunchFolderClaim,
        occupiedCallNames: @escaping @Sendable () throws -> [String],
        boundary: ComposerBoundary,
        processes: CoreAudioProcesses,
        panel: AudelinPanel,
        openFolder: @escaping (URL) -> Void,
        openURL: @escaping (URL) -> Void,
        terminate: @escaping @Sendable () async -> Void,
        sink: any LogSink,
        presentPanel: @escaping (Bool) -> Void,
        sleep: @escaping @Sendable (Duration) async throws -> Void,
        finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources,
        summaries: SummariesModel? = nil,
        language: CurrentLanguage
    ) async {

        currentLanguage = language
        languageChoice = LanguageChoice(storage.read().language)
        preferredLanguages = boundary.preferredLanguages
        saveLanguage = storage.updateLanguage
        appearance = storage.read().appearance
        saveAppearance = storage.updateAppearance
        self.language = language.language

        self.sink = sink
        self.panel = panel
        self.finalization = finalization
        self.summaries = summaries
        let application: MenuApplication?
        do {
            let recording = try await AudelinRecording(preferences: storage, folderClaim: folderClaim, occupiedCallNames: occupiedCallNames, boundary: boundary,
                                                       processes: processes, panel: panel, finalization: finalization, finalizationResources: finalizationResources, summaries: summaries?.callbacks(timeZone: boundary.time.timeZone(), notesOn: { storage.read().notes.enabled }) ?? .disabled)
            application = MenuApplication(
                states: { await recording.inputs.ownStates() }, failures: recording.detectionFailures,
                send: { await recording.inputs.send($0) },
                stopDelivery: { await recording.stopDelivery() }, end: { await recording.inputs.end() },
                storageMoving: { await recording.storageMoving($0) },
                panelStates: { await recording.panel.states() },
                sendPanel: { await recording.panel.send($0) }
            )
        } catch {
            sink.write(.init(category: .menu, message: "startup failed", error: String(describing: error)))
            application = nil
            failure = (.watchFailedToStart, "\(error)")
        }
        let send = application?.send ?? { _ in }
        settings = PreferenceSettings(storage: storage, automaticChanged: { await send(.automaticChanged($0)) })
        self.recordingStates = application?.states ?? { AsyncStream { $0.finish() } }
        self.panels = application?.panelStates ?? { AsyncStream { $0.finish() } }
        self.send = send
        self.openFolder = openFolder
        self.openURL = openURL
        self.storageMoving = application?.storageMoving ?? { _ in }
        self.sendPanelEvent = application?.sendPanel ?? { _ in }
        let termination = makeTermination(
            claimFolder: { [pendingRelaunch] in
                let token = await relaunchClaim.take()
                if token == nil { await pendingRelaunch.finish(scheduled: false) }
                return token
            },
            releaseFolder: { [pendingRelaunch] in
                await relaunchClaim.release($0)
                await pendingRelaunch.finish(scheduled: false)
            },
            relaunch: { [pendingRelaunch] in await pendingRelaunch.run() },
            unsettled: application == nil ? [.finalization, .summaries, .storage] : Set(TerminationParticipant.allCases),
            terminate: { [end = application?.end] in await end?(); await terminate() })
        self.termination = termination
        presence = PanelPresenceModel(handler: PanelPresenceEffectHandler(
            present: { visible, reason in
                presentPanel(visible)
                sink.write(.init(category: .panel, message: "\(visible ? "shown" : "hidden") reason=\(reason.rawValue)"))
            },
            showCalls: { [weak self] in self?.calls?.show() },
            sleep: sleep))
        // What blocks a relaunch reaches Lifecycle first as it is and then on each change.
        blockerObservation = Task { [weak self] in
            for await blockers in Observations({ [weak self] in self?.relaunchBlockers ?? [] }) {
                self?.termination.event(.blockersChanged(blockers))
            }
        }
        shutdownObservation = Task { [weak self] in
            for await state in Observations({ termination.state }) where state.phase == .quitting {
                // A started relaunch quits without the menu's quit, so the menu learns it here.
                self?.quitting = true
                self?.summaries?.stopDispatch()
                self?.shutDown(application: application, finalization: finalization)
                return
            }
        }
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
                    self.presence.recordingChanged(panelRecordingID(state))
                    sink.write(.init(category: .menu, message: "item symbol=\(self.menu.item.symbol) red=\(self.menu.item.isRed)"))
                }
            }
            detectionObservation = Task { [weak self, failures = application.failures] in
                for await error in failures {
                    guard let self else { return }
                    sink.write(.init(category: .menu, message: "detection failed", error: String(describing: error)))
                    self.failure = (.watchStopped, "\(error)")
                }
            }
        }
    }

    func installFinalizationSubscriptions(speakers: Task<Void, Never>, transactions: Task<Void, Never>) {
        finalizationSubscriptions = [speakers, transactions]
    }

    func installMergeAvailability(_ subscription: Task<Void, Never>) { finalizationSubscriptions.append(subscription) }
    func installMoveHold(_ subscription: Task<Void, Never>) { finalizationSubscriptions.append(subscription) }

    func installFolderPicker(_ choose: @escaping () async throws -> URL?) { chooseFolder = choose }
    /// Whether a folder move holds the calls folder, as Recordings says; RecordingConditions hears it.
    func callsFolderMoving(_ moving: Bool) async { await storageMoving(moving) }

    func installSettings(_ model: AudelinSettings, present: @escaping () -> Void) {
        summarySettings = model; presentSettings = present
    }

    public var settingsState: SettingsState {
        var result = SettingsState(recordsCalls: preferences.automaticRecording, liveText: preferences.liveText,
                      folder: .init(path: settings.callsFolder.path, status: state.phase == .idle ? .idle(calls: "") : .recording),
                      engines: [.init(id: "parakeet", name: "Parakeet v3", note: settingsText(.localRecognition), availability: "", size: "")],
                      selectedEngine: "parakeet", explainKeys: "", selectedTab: summarySettings?.selectedTab ?? .general,
                      callNotes: summarySettings?.notes ?? .loading(settingsText(.notesLoading)),
                      general: settingsText.general(languageChoice, appearance: appearance, preferred: preferredLanguages()))
        if pickerFailed, case .idle = result.folder.status { result.folder.status = .pickerFailed(reason: settingsText(.pickerFailedReason)) }
        if let recordings = calls?.recordingsState { applyFolderMove(recordings, text: settingsText, to: &result) }
        return result
    }
    public func sendSettings(_ event: SettingsEvent) async {
        guard !quitting else { return }
        switch event {
        case .changeFolder:
            choosingFolder = true
            defer { choosingFolder = false }
            sink.write(.init(category: .menu, message: "folder picker requested"))
            pickerFailed = false
            do {
                if let destination = try await chooseFolder() { calls?.sendRecordings(.chooseFolder(destination)) }
            } catch {
                sink.write(.init(category: .menu, message: "folder picker failed", error: String(describing: error)))
                pickerFailed = true
            }
        case .confirmMove: calls?.sendRecordings(.confirmMove)
        case .retryMove: calls?.sendRecordings(.retryMove)
        case .cancelMove: calls?.sendRecordings(.cancelMove)
        case let .setRecordsCalls(value): await perform(.setAutomatic(value))
        case let .setLiveText(value): await perform(.setLiveText(value))
        case let .selectLanguage(value): await chooseLanguage(LanguageChoice(rawValue: value.rawValue) ?? .system)
        case let .selectAppearance(value): chooseAppearance(Preferences.Appearance(rawValue: value.rawValue) ?? .system)
        default: summarySettings?.send(event)
        }
    }

    /// Saves the choice, then shows Audelin in the language it gives.
    private func chooseLanguage(_ choice: LanguageChoice) async {
        guard choice != languageChoice else { return }
        do { try saveLanguage(choice.saved) } catch {
            sink.write(.init(category: .menu, message: "language save failed", error: String(describing: error)))
        }
        languageChoice = choice
        await languageChanged(uiLanguage(choice, preferred: preferredLanguages()))
    }

    /// Saves the choice and applies it at once.
    private func chooseAppearance(_ choice: Preferences.Appearance) {
        guard choice != appearance else { return }
        do { try saveAppearance(choice) } catch {
            sink.write(.init(category: .menu, message: "appearance save failed", error: String(describing: error)))
        }
        appearance = choice
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
            await settings.setLiveText(enabled)
        case .showCalls: calls?.show()
        case .showSettings: presentSettings()
        case .showPanel: presence.event(.reopen)
        case .hidePanel: presence.event(.userClosed)
        case .openCallsFolder: openFolder(settings.callsFolder)
        case .quit:
            quitting = true
            summaries?.stopDispatch()
            termination.event(.quit)
            for await state in Observations({ self.termination.state }) where state.phase == .terminated { return }
        }
    }

    /// Sends shutdown to each participant on the quit intention, and each one's settled outcome
    /// to the termination machine. Summaries shut down once final transcripts have reached them.
    private func shutDown(application: MenuApplication?, finalization: TranscriptFinalizationModel) {

        let termination = termination
        finalization.send(.shutdown)
        if let application {
            Task {
                await application.stopDelivery()
                await application.send(.shutdown)
                for await state in await application.states() where state.shutdown == .settled { break }
                termination.event(.settled(.recording))
            }
        } else {
            // Without Recording no transcript output ends, so finalization is told directly.
            finalization.send(.inputEnded)
        }
        if let calls {
            Task { await calls.drainMove(); termination.event(.settled(.storage)) }
        } else {
            termination.event(.settled(.storage))
        }
        Task { [summaries] in
            await finalization.settled()
            termination.event(.settled(.finalization))
            await summaries?.shutdown()
            termination.event(.settled(.summaries))
        }
    }

    /// Checks after each `wait` whether the bundle was replaced, then relaunches
    /// at the first idle check. `wait` throwing ends the watch.
    public func relaunchAfterUpdate(wait: @escaping @Sendable () async throws -> Void, replaced: @escaping @Sendable () -> Bool,
                                    relaunch: @escaping () throws -> Void) {

        updateWatch = Task { [weak self] in
            var updated = false
            while (try? await wait()) != nil {
                updated = updated || replaced()
                guard updated, let self else { continue }
                if await self.relaunchIfIdle(relaunch) { return }
            }
        }
    }

    /// Lifecycle decides whether the update may relaunch now and holds the calls-folder claim
    /// for it, so no recording or move starts behind the decision; a scheduled relaunch quits the app.
    func relaunchIfIdle(_ relaunch: @escaping () throws -> Void) async -> Bool {

        await summaries?.refresh()
        guard !quitting else { return false }
        let blockers = TerminationEvent.blockersChanged(relaunchBlockers)
        // Events are reduced later; nothing reduced before them can change this decision while not quitting.
        let current = TerminationReducer.reduce(termination.state, blockers).0
        guard TerminationReducer.reduce(current, .relaunchRequested).1 == .claimFolder else { return false }
        let outcome = AsyncStream<Bool>.makeStream()
        pendingRelaunch.outcome = outcome.continuation
        pendingRelaunch.start = { [sink] in
            do { try relaunch() } catch {
                sink.write(.init(category: .menu, message: "relaunch failed", error: String(describing: error)))
                return false
            }
            sink.write(.init(category: .menu, message: "relaunching for update"))
            return true
        }
        termination.event(blockers)
        termination.event(.relaunchRequested)
        var results = outcome.stream.makeAsyncIterator()
        guard await results.next() == true else { return false }
        for await state in Observations({ self.termination.state }) where state.phase == .terminated { break }
        return true
    }

    private var relaunchBlockers: Set<RelaunchBlocker> {
        var blockers: Set<RelaunchBlocker> = []
        if finalization.state.calls.values.contains(where: { !$0.published }) { blockers.insert(.finalization) }
        if choosingFolder { blockers.insert(.folderPicker) }
        if calls?.idle == false { blockers.insert(.callsWindow) }
        if summaries?.busy == true { blockers.insert(.summaries) }
        return blockers
    }

    public func panelClosed() { presence.event(.userClosed) }

    public func appReopened() {

        guard !quitting else { return }
        presence.event(.appReopen)
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

    isolated deinit {

        for subscription in finalizationSubscriptions { subscription.cancel() }
        panelObservation?.cancel()
        observation?.cancel()
        detectionObservation?.cancel()
        updateWatch?.cancel()
        shutdownObservation?.cancel()
        blockerObservation?.cancel()
    }
}

private func panelRecordingID(_ state: RecordingState) -> UInt64? {

    switch state.phase {
    case .beginning, .recording, .ending: state.session?.id
    case .idle: nil
    }
}

/// The relaunch the termination machine schedules, installed by the update check that asked for it,
/// and where that check hears how the attempt ended.
@MainActor
private final class PendingRelaunch {

    var start: () -> Bool = { false }
    var outcome: AsyncStream<Bool>.Continuation?

    func run() async -> Bool {
        let scheduled = start()
        if scheduled { finish(scheduled: true) }
        return scheduled
    }

    func finish(scheduled: Bool) {
        outcome?.yield(scheduled)
        outcome?.finish()
        outcome = nil
    }
}
