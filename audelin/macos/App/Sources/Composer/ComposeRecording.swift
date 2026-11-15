import Preferences
import CoreAudioProcesses
import Foundation
import Recording
import CallAudioAccess
import Synchronization

func composeRecording(
    preferences: PreferencesStore, folderClaim: RecordingFolderClaim, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
) async -> RecordingInputs {
    let initial = RecordingState(automatic: preferences.read().automaticRecording)
    let access = accessPolicy(boundary.access)
    let sink = boundary.log
    // Ending Recording clears the path its pieces report on, which otherwise keeps the model alive.
    let destination = Mutex<RecordingInputs?>(nil)
    let pieces = RecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes, boundary: boundary, send: { event in
        guard let recording = destination.withLock({ $0 }) else { return }
        await recording.send(event)
    }, panel: panel, finalization: finalization, finalizationResources: finalizationResources, summaries: summaries)
    let log = { @Sendable state in StateLog(sink: sink).recording(state) }
    log(initial)
    let model = await makeRecording(initial: initial, log: log, folderClaim: folderClaim, callAudioReady: {
        guard await access.refresh() else { return false }
        return await access.reserve()
    }, liveText: { preferences.read().liveText }, callAudioReleased: { await access.release() },
    runPiece: { id, effect in await pieces.run(id: id, effect) }, status: pieces.status)
    // The panel follows the pieces in the order Recording reduced them.
    let states = await model.states()
    Task {
        for await state in states { await pieces.observe(state) }
    }
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
