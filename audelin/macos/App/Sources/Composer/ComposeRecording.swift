import Preferences
import CoreAudioProcesses
import Foundation
import Recording
import CallAudioAccess
import Synchronization

func composeRecording(
    preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, cleanupRuns: CleanupRuns, summaries: SummaryCallbacks = .disabled
) async -> RecordingInputs {
    let initial = RecordingState(automatic: preferences.read().automaticRecording)
    let access = accessPolicy(boundary.access)
    let sink = boundary.log
    // Ending Recording clears the report path, which otherwise keeps the model alive through its Session.
    let destination = Mutex<RecordingInputs?>(nil)
    let sessions = RecordingSessions(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes, boundary: boundary, report: { id, report in
        guard let recording = destination.withLock({ $0 }) else { return }
        await recording.send(.sessionReported(id: id, report))
    }, panel: panel, cleanupRuns: cleanupRuns, summaries: summaries)
    let log = { @Sendable state in StateLog(sink: sink).recording(state) }
    log(initial)
    let model = await makeRecording(initial: initial, session: LoggingRecordingSession(base: sessions, sink: sink), log: log, callAudioReady: {
        guard await access.refresh() else { return false }
        return await access.reserve()
    }, callAudioReleased: { await access.release() })
    var recording = RecordingInputs(send: model.send, state: model.state, states: model.states, end: {
        destination.withLock { $0 = nil }
        await model.end()
    })
    recording.reserveStorage = model.reserveStorage
    recording.releaseStorage = model.releaseStorage
    let connected = recording
    destination.withLock { $0 = connected }
    return recording
}
