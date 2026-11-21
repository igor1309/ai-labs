import Preferences
import CoreAudioProcesses
import Foundation
import Recording
import CallAudioAccess
import Synchronization

@MainActor
func composeRecording(
    preferences: PreferencesStore, folderClaim: RecordingFolderClaim, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
) async -> RecordingInputs {
    let transcriptOutput = AsyncStream<RecordingTranscript>.makeStream()
    let initial = RecordingState(automatic: preferences.read().automaticRecording)
    let access = accessPolicy(boundary.access)
    let sink = boundary.log
    let now = boundary.time.monotonicNow
    let readings = AsyncStream<(id: UInt64, session: SessionState, instant: Double)>.makeStream()
    let names = panel.names
    var watchingSession: UInt64?
    // Ending Recording clears the path its pieces report on, which otherwise keeps the model alive.
    let destination = Mutex<RecordingInputs?>(nil)
    let pieces = RecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes, boundary: boundary, send: { event in
        guard let recording = destination.withLock({ $0 }) else { return }
        await recording.send(event)
    }, panel: panel, canWatch: { watchingSession == $0 }, transcriptOutput: transcriptOutput.continuation,
       finalizationResources: finalizationResources, summaries: summaries)
    let logged = Mutex<RecordingState?>(nil)
    let log = { @Sendable (state: RecordingState) in
        let own = recordingOwnState(state)
        guard logged.withLock({ let changed = $0 != own; $0 = own; return changed }) else { return }
        StateLog(sink: sink).recording(state)
    }
    log(initial)
    let model = makeRecording(initial: initial, log: log, changed: { previous, state in
        guard let id = state.session?.id, let session = state.pieces else { return }
        let sameSession = previous.session?.id == id
        guard !sameSession || previous.pieces.map(ObservedSession.init) != ObservedSession(session) else { return }
        let instant = now()
        if !sameSession || previous.pieces?.phase != session.phase {
            watchingSession = session.phase == .ended ? nil : id
            // Enqueue the naming change before Recording dispatches work that can produce rows.
            names.sessionChanged(id: id, phase: session.phase, hasTranscript: session.transcript != .down, at: instant)
        }
        readings.continuation.yield((id, session, instant))
    }, folderClaim: folderClaim, sleep: { try? await boundary.time.sleep($0) }, callAudioReady: {
        guard await access.refresh() else { return false }
        return await access.reserve()
    }, liveText: { preferences.read().liveText }, callAudioReleased: { await access.release() },
    runPiece: { id, effect in await pieces.run(id: id, effect) }, status: pieces.status)
    // The panel follows the pieces in the order Recording reduced them.
    let observation = Task {
        for await (id, session, instant) in readings.stream { await pieces.observe(id: id, session, at: instant) }
    }
    // The panel can still be reading finalization's speakers after Recording settles.
    let transcriptStates = await model.states()
    let transcriptCompletion = Task {
        for await state in transcriptStates where state.shutdown == .settled { break }
        transcriptOutput.continuation.finish()
    }
    var recording = RecordingInputs(send: model.send, state: model.state, states: model.states, end: {
        destination.withLock { $0 = nil }
        await model.end()
        readings.continuation.finish()
        await transcriptCompletion.value
        await observation.value
    })
    recording.transcriptOutput = transcriptOutput.stream
    let connected = recording
    destination.withLock { $0 = connected }
    return recording
}

/// Recording's state without its pieces, which change with every audio window.
func recordingOwnState(_ state: RecordingState) -> RecordingState {
    var own = state
    own.pieces = nil
    return own
}
