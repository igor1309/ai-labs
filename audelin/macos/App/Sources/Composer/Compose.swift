import Calls
import CallDetail
import NotesMenu
import CallsStorage
import CoreAudioProcesses
import CallsListUI
import Foundation
import Observation
import Preferences
import Recordings
import TrackFile
import SummaryRuntime
import SummaryFiles
import TemplateFiles
import SettingsUI

/// Builds the same recording, panel, menu and calls composition for every caller.
@MainActor
public func compose(
    boundary: ComposerBoundary,
    preferencesURL: URL,
    openCallsFolder: @escaping (URL) -> Bool,
    presentCalls: @escaping () -> Void,
    openURL: @escaping (URL) -> Void,
    presentPanel: @escaping (Bool) -> Void,
    terminate: @escaping @Sendable () async -> Void,
    presentSettings: @escaping () -> Void = {},
    chooseCallsFolder: @escaping () async throws -> URL? = { nil },
    summaryRuntime: SummaryRuntime.Runtime? = nil,
    copyNotes: @escaping (String) -> Void = { _ in },
    readCall: @escaping () -> Void = {},
    notify: @escaping @MainActor (AppNotificationContent) -> Void = { _ in }
) async -> AudelinMenu {
    let preferences = PreferencesStore(fileURL: preferencesURL)
    await createDefaultCallsFolder(preferences.read().callsFolder, default: Preferences().callsFolder)
    let panel = AudelinPanel(now: boundary.time.monotonicNow,
                             ticks: boundary.time.ticks, sink: boundary.log, intervals: boundary.intervals,
                             browser: boundary.browser, sleep: boundary.time.sleep,
                             zoomName: ZoomName(read: { preferences.read().zoomName }, remember: { name in
                                 do { try preferences.updateZoomName(name) } catch {
                                     boundary.log.write(.init(category: .calls, message: "zoom name not saved"))
                                 }
                             }))
    let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes),
                                       clock: BoundaryCallClock(time: boundary.time))
    let timeZone = boundary.time.timeZone()
    let storage = callsStorage(folder: preferences.read().callsFolder, timeZone: timeZone, journal: preferencesURL.deletingLastPathComponent().appendingPathComponent("summary-folders.json"), trash: boundary.trash, disk: boundary.callsDisk, operation: boundary.callsOperation)
    do { try await storage.restore() } catch { boundary.log.write(.init(category: .calls, message: "calls-folder recovery failed")) }
    let runtime = summaryRuntime ?? SummaryRuntime.Runtime(
        process: ProcessRunner(now: boundary.time.monotonicNow, deadline: 120, outputLimit: 4 * 1024 * 1024, observe: { _ in }),
        http: HTTPClient(limit: 4 * 1024 * 1024, sleep: { try await boundary.time.sleep(.seconds(120)) }),
        credential: { name in
            guard let value = getenv(name) else { return nil }
            return String(cString: value)
        }, resolveProgram: summaryExecutable(path: ProcessInfo.processInfo.environment["PATH"] ?? "",
                                            home: FileManager.default.homeDirectoryForCurrentUser.path).resolve,
        deadline: { try await boundary.time.sleep(.seconds(120)) })
    let summaryFiles = SummaryFiles.Files(locations: storage, disk: FileDisk(), ownershipDirectory: preferencesURL.deletingLastPathComponent().appendingPathComponent("summary-ownership"))
    let language = CurrentLanguage(uiLanguage(LanguageChoice(preferences.read().language), preferred: boundary.preferredLanguages()))
    let made: @Sendable (Date) -> String = { date in
        date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, locale: language.language.callsList.locale, timeZone: timeZone))
    }
    let templates = TemplateFiles.Files(folder: preferencesURL.deletingLastPathComponent().appendingPathComponent("Templates"), disk: TemplateFiles.FileDisk(), openFolder: { @MainActor folder in
        guard openCallsFolder(folder) else { throw CocoaError(.fileReadUnknown, userInfo: [NSFilePathErrorKey: folder.path]) }
    })
    let summaries = SummariesModel(keeping: { preferences.read().keepPreviousNotes }, templates: DefaultTemplatePort(files: templates), text: { language.language.callsList },
        preparation: SummariesPreparationPort(notes: { preferences.read().notes }, makeID: { UUID().uuidString },
                                              callText: { try await storage.text(id: $0) }),
        files: SummariesFilesPort(files: summaryFiles, makeID: { UUID().uuidString }),
        generation: SummaryGeneration(runtime: runtime, sink: boundary.log))
    let resources = FinalizationResources()
    // The machine owns this port, and the port reads the machine's speakers: the box holds it weakly.
    let finalizationForSpeakers = WeakFinalization()
    let finalization = TranscriptFinalizationModel(diarizing: FinalizationDiarizing(resources: resources),
        cleanup: FinalizationCleanup(resources: resources), replacement: FinalizationReplacement(resources: resources),
        finals: FinalTranscriptsPort(resources: resources, deliver: { call, transcript in
            if let state = await finalizationForSpeakers.model?.state { await resources.showSpeakers(state) }
            if let id = Calls.id(in: URL(fileURLWithPath: call).lastPathComponent, timeZone: timeZone) {
                await summaries.send(.finalized(id, entries: transcript.entries, finalWrite: transcript.finalWrite,
                                                usable: transcript.usable, notesOn: preferences.read().notes.enabled,
                                                transcriptIdentity: try? await storage.text(id: id).identity))
            }
        }))
    finalizationForSpeakers.model = finalization
    let speakers = Task {
        for await state in finalization.states() { await resources.showSpeakers(state) }
    }
    let menu = await AudelinMenu(storage: preferences, folderClaim: RecordingFolderClaim(storage: storage), relaunchClaim: RelaunchFolderClaim(storage: storage), occupiedCallNames: { try storage.occupiedCallNames() }, boundary: boundary, processes: processes, panel: panel,
        openFolder: { _ = openCallsFolder($0) }, openURL: openURL, terminate: terminate,
        sink: boundary.log, presentPanel: presentPanel, sleep: boundary.time.sleep,
        finalization: finalization, finalizationResources: resources, summaries: summaries, language: language)
    menu.installFinalizationSubscriptions(speakers: speakers,
                                          transactions: subscribeTransactions(storage.transactions(), to: summaries))
    menu.installFolderPicker(chooseCallsFolder)
    menu.installSettings(AudelinSettings(preferences: SummaryPreferences(storage: preferences),
                                        availability: SummaryAvailability(runtime: runtime), text: { language.language.settings }), present: presentSettings)
    var disk = SummaryCalls(storage: storage, release: boundary.transcriptBuild.release, deleted: { await summaries.forget(call: $0) },
                            merged: { call, parts, entries in
                                await summaries.merged(call: call, parts: parts, entries: entries,
                                                       notesOn: preferences.read().notes.enabled,
                                                       transcriptIdentity: try? await storage.text(id: call).identity)
                            })
    disk.log = boundary.log
    let moveClaim = MoveFolderClaim(storage: storage)
    let recordings = makeRecordings(handler: RecordingsEffectHandler(calls: disk, transcriptAgain: transcriptAgain(storage: storage, boundary: boundary,
                                          describe: { language.language.settings.callsFailure($0) }),
                                      reserve: moveClaim.take, release: moveClaim.release,
                                      storeFolder: { destination in
                                          try await storage.commitFolder(destination) { try preferences.updateCallsFolder(destination) }
                                      }, describe: { language.language.settings.callsFailure($0) }), text: { language.language.settings },
                                      initial: .init(callsFolder: preferences.read().callsFolder))
    menu.installMoveHold(subscribeMoveHold({ recordings.state().callsFolderAvailable },
                                           to: { [weak menu] moving in await menu?.callsFolderMoving(moving) }))
    menu.installNotifications(subscribeNotifications(phase: { [weak menu] in menu?.state.phase ?? .idle },
                                                     stages: { summaries.state.calls.mapValues(\.stage) },
                                                     post: { notify($0.content(language.language)) }))
    menu.installMergeAvailability(subscribeMergeAvailability({ [weak menu] in
        idleToMerge(recording: menu?.state.phase ?? .idle, finishing: finalization.state.calls.values.map(\.stage),
                    notesBusy: summaries.busy)
    }, to: { recordings.send($0) }))
    menu.installCalls(AudelinCalls(inputs: recordings,
                                  timeZone: timeZone, now: boundary.time.now, recordingState: { [weak menu] in menu?.state ?? .init() },
                                  location: { try await storage.location(id: $0) }, openFolder: openCallsFolder,
                                  present: presentCalls, summaryStatuses: { summaries.statuses }, summaryBadges: { summaries.badges },
                                  notes: { id in
                                      guard let pair = try await summaryFiles.versions(call: id) else { return nil }
                                      let transcript = try await storage.text(id: id)
                                      let previous = try await storage.list().first { $0.id == id }?.hasPreviousTranscript ?? false
                                      return callNotesPair(pair, transcript: transcript, hasPrevious: previous, made: made)
                                  },
                                  makeSummary: { summaries.make(call: $0) },
                                  makeWithTemplate: { summaries.make(call: $0, template: $1) },
                                  catalogue: {
                                      notesCatalogue(templates.list())
                                  },
                                  openTemplatesFolder: { try await templates.open() },
                                  previewText: { language.language.preview },
                                  summaryTemplates: { summaries.state.calls.mapValues { $0.job?.template?.name ?? $0.requestedTemplate } },
                                  summaryFailures: { summaries.state.calls.compactMapValues { $0.generationFailure.map(detailFailure) } },
                                  publications: {
                                      Dictionary(uniqueKeysWithValues: summaries.state.calls.compactMap { call, value in
                                          guard value.stage == .succeeded, let job = value.job else { return nil }
                                          return (call, job.id)
                                      })
                                  },
                                  keepingChanges: preferences.keepingChanges(),
                                  readKeeping: { preferences.read().keepPreviousNotes },
                                  saveKeeping: { try preferences.updateKeeping($0) },
                                  cancelSummary: { await summaries.cancel(call: $0) },
                                  copy: copyNotes, readCall: readCall,
                                  retryableSummaries: { summaries.retryable }, retrySummary: { try await summaries.retry(call: $0) },
                                  describe: { language.language.settings.callsFailure($0) },
                                  listText: language.language.callsList,
                                  callText: { id in
                                      let transcript = try await storage.text(id: id).transcript
                                      let notes = try await summaryFiles.notes(call: id)?.text
                                      return CallsText(notes: notes, transcript: transcript)
                                  }))
    do { summaries.recover(calls: try await storage.list().map(\.id)) }
    catch { boundary.log.write(.init(category: .session, message: "summary recovery listing failed")) }
    return menu
}

/// Sends each calls-storage transaction state to SummaryJobs, which holds note publication while one runs.
@MainActor func subscribeTransactions(_ transactions: AsyncStream<CallsTransaction>, to summaries: SummariesModel) -> Task<Void, Never> {
    Task { for await transaction in transactions { summaries.send(.transaction(running: transaction == .running)) } }
}

/// Sends Recordings whether Audelin is idle enough to merge: the current value at once, then each change.
/// Sends RecordingConditions whether a folder move holds the calls folder, whenever Recordings changes it.
@MainActor func subscribeMoveHold(_ available: @escaping @MainActor () -> Bool,
                                  to send: @escaping @MainActor (Bool) async -> Void) -> Task<Void, Never> {
    Task {
        var last = true
        for await available in Observations({ available() }) where available != last {
            last = available
            await send(!available)
        }
    }
}

@MainActor func subscribeMergeAvailability(_ idle: @escaping @MainActor () -> Bool,
                                           to send: @escaping @MainActor (RecordingsEvent) -> Void) -> Task<Void, Never> {
    Task {
        var last: Bool?
        for await available in Observations({ idle() }) where available != last {
            last = available
            send(.mergeAvailability(available))
        }
    }
}

func summaryExecutable(path: String, home: String) -> ClaudeExecutable {
    ClaudeExecutable(path: path, home: home, isExecutableFile: { program in
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: program, isDirectory: &directory)
            && !directory.boolValue && FileManager.default.isExecutableFile(atPath: program)
    })
}

@MainActor final class WeakFinalization {
    weak var model: TranscriptFinalizationModel?
}

/// Preserve failed files separately from the built-in choice with the same name.
func notesCatalogue(_ catalogue: TemplateFiles.Catalogue) -> NotesMenuState.Catalogue {
    .init(templates: catalogue.entries.map {
        .init(id: $0.reason == nil ? $0.name : "file:/" + ($0.file ?? $0.name), name: $0.name,
              usable: $0.reason == nil, enabled: false, reason: $0.reason, isFile: $0.file != nil)
    }, folderReason: catalogue.folderReason)
}

func callNotesPair(_ pair: SummaryFiles.Versions, transcript: Calls.Text, hasPrevious: Bool,
                   made: (Date) -> String) -> CallNotesPair {
    func version(_ notes: SummaryFiles.Notes) -> CallNotes {
        .init(text: notes.text, made: made(notes.made), templateID: notes.template.id, templateName: notes.template.name,
              transcriptIdentity: notes.transcriptIdentity)
    }
    return CallNotesPair(previous: pair.previous.map(version), current: version(pair.current),
                         currentTranscriptIdentity: transcript.identity, hasPreviousTranscript: hasPrevious)
}
