import Calls
import CoreAudioProcesses
import CallsListUI
import Foundation
import Preferences
import Recordings
import TrackFile
import SummaryRuntime
import SummaryFiles
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
    readCall: @escaping () -> Void = {}
) async -> AudelinMenu {
    let preferences = PreferencesStore(fileURL: preferencesURL)
    await createDefaultCallsFolder(preferences.read().callsFolder, default: Preferences().callsFolder)
    let panel = AudelinPanel(now: boundary.time.monotonicNow,
                             ticks: boundary.time.ticks, sink: boundary.log, intervals: boundary.intervals,
                             browser: boundary.browser, sleep: boundary.time.sleep)
    let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes),
                                       clock: BoundaryCallClock(time: boundary.time))
    let timeZone = boundary.time.timeZone()
    let storage = SummaryStorage(folder: preferences.read().callsFolder, timeZone: timeZone, journal: preferencesURL.deletingLastPathComponent().appendingPathComponent("summary-folders.json"), trash: boundary.trash)
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
    let summaries = AudelinSummaries(files: summaryFiles,
                                     runtime: runtime, preferences: preferences, sink: boundary.log,
                                     callText: { try await storage.text(id: $0) }, date: made,
                                     text: language.language.callsList, status: { language.language.callsList.summaryStatus($0, $1) })
    let cleanupRuns = CleanupRuns()
    let menu = await AudelinMenu(storage: preferences, occupiedCallNames: { try storage.occupiedCallNames() }, boundary: boundary, processes: processes, panel: panel,
        openFolder: { _ = openCallsFolder($0) }, openURL: openURL, terminate: terminate,
        sink: boundary.log, presentPanel: presentPanel, sleep: boundary.time.sleep, cleanupRuns: cleanupRuns, summaries: summaries, language: language)
    menu.installFolderPicker(chooseCallsFolder)
    menu.installSettings(AudelinSettings(preferences: SummaryPreferences(storage: preferences),
                                        availability: SummaryAvailability(runtime: runtime), text: { language.language.settings }), present: presentSettings)
    let disk = SummaryCalls(storage: storage, deleted: { await summaries.forget(call: $0) })
    menu.installCalls(AudelinCalls(inputs: makeRecordings(handler: RecordingsEffectHandler(calls: disk,
                                      reserve: { [weak menu] in await menu?.reserveCallsFolder() ?? false },
                                      release: { [weak menu] in await menu?.releaseCallsFolder() },
                                      storeFolder: { destination in
                                          try await storage.commitFolder(destination) { try preferences.updateCallsFolder(destination) }
                                      }, describe: { language.language.settings.callsFailure($0) }), text: { language.language.settings }, initial: .init(callsFolder: preferences.read().callsFolder)),
                                  timeZone: timeZone, now: boundary.time.now, recordingState: { [weak menu] in menu?.state ?? .init() },
                                  location: { try await storage.location(id: $0) }, openFolder: openCallsFolder,
                                  present: presentCalls, summaryStatuses: { summaries.statuses }, summaryBadges: { summaries.badges },
                                  notes: { try await summaries.notes(call: $0).map { (text: $0.text, made: made($0.made)) } },
                                  notesState: { summaries.notesState(call: $0) },
                                  makeSummary: { summaries.make(call: $0) }, cancelSummary: { await summaries.cancel(call: $0) },
                                  copy: copyNotes, readCall: readCall,
                                  retryableSummaries: { summaries.retryable }, retrySummary: { try await summaries.retry(call: $0) },
                                  describe: { language.language.settings.callsFailure($0) },
                                  listText: language.language.callsList,
                                  callText: { try await storage.text(id: $0) }))
    do { await summaries.recover(calls: try await storage.list().map(\.id)) }
    catch { boundary.log.write(.init(category: .session, message: "summary recovery listing failed")) }
    return menu
}

func summaryExecutable(path: String, home: String) -> ClaudeExecutable {
    ClaudeExecutable(path: path, home: home, isExecutableFile: { program in
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: program, isDirectory: &directory)
            && !directory.boolValue && FileManager.default.isExecutableFile(atPath: program)
    })
}
