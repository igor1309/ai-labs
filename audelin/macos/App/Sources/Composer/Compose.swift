import Calls
import CoreAudioProcesses
import Foundation
import Preferences
import Recordings

/// Builds the same recording, panel, menu and calls composition for every caller.
@MainActor
public func compose(
    boundary: ComposerBoundary,
    preferencesURL: URL,
    openCallsFolder: @escaping (URL) -> Bool,
    presentCalls: @escaping () -> Void,
    openURL: @escaping (URL) -> Void,
    presentPanel: @escaping (Bool) -> Void,
    terminate: @escaping @Sendable () async -> Void
) async -> AudelinMenu {
    let preferences = await withCheckedContinuation { done in
        DispatchQueue(label: "audelin.preferences.load").async {
            done.resume(returning: PreferencesStore(fileURL: preferencesURL))
        }
    }
    await createDefaultCallsFolder(preferences.read().callsFolder, default: Preferences().callsFolder)
    let panel = AudelinPanel(makeReading: makeReading, now: boundary.time.monotonicNow,
                             ticks: boundary.time.ticks, sink: boundary.log, intervals: boundary.intervals)
    let menu = await AudelinMenu(storage: preferences, makeApplication: {
        let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes),
                                           clock: BoundaryCallClock(time: boundary.time))
        let application = try await AudelinRecording(preferences: preferences, boundary: boundary,
                                                     processes: processes, panel: panel)
        return MenuApplication(
            states: { await application.inputs.states() }, failures: application.detectionFailures,
            send: { await application.inputs.send($0) },
            quit: { await quit(application.lifecycle(terminate: terminate)) },
            panelStates: { await application.panel.states() },
            sendPanel: { await application.panel.send($0) }
        )
    }, openFolder: { _ = openCallsFolder($0) }, openURL: openURL, terminate: { await terminate() },
        didDeliver: {}, sink: boundary.log, presentPanel: presentPanel, sleep: boundary.time.sleep)
    let timeZone = boundary.time.timeZone()
    let disk = ComposeCalls(disk: Calls(folder: menu.preferences.callsFolder, timeZone: timeZone))
    menu.installCalls(AudelinCalls(inputs: makeRecordings(handler: RecordingsEffectHandler(calls: disk)),
                                  timeZone: timeZone, recordingState: { [weak menu] in menu?.state ?? .init() },
                                  location: { try await disk.location(id: $0) }, openFolder: openCallsFolder,
                                  present: presentCalls))
    return menu
}
