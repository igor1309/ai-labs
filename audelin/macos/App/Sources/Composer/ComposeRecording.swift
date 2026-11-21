import Preferences
import CoreAudioProcesses
import Foundation
import Recording
import CallAudioAccess
import Synchronization

func composeRecording(
    preferences: PreferencesStore, folderClaim: RecordingFolderClaim, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
) async -> RecordingInputs {
    let transcriptOutput = AsyncStream<RecordingTranscript>.makeStream()
    let initial = RecordingState(automatic: preferences.read().automaticRecording)
    let access = accessPolicy(boundary.access)
    let sink = boundary.log
    // Ending Recording clears the path its pieces report on, which otherwise keeps the model alive.
    let destination = Mutex<RecordingInputs?>(nil)
    let pieces = RecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes, boundary: boundary, send: { event in
        guard let recording = destination.withLock({ $0 }) else { return }
        await recording.send(event)
    }, panel: panel, transcriptOutput: transcriptOutput.continuation, finalizationResources: finalizationResources, summaries: summaries)
    let logged = Mutex<RecordingState?>(nil)
    let log = { @Sendable (state: RecordingState) in
        let own = recordingOwnState(state)
        guard logged.withLock({ let changed = $0 != own; $0 = own; return changed }) else { return }
        StateLog(sink: sink).recording(state)
    }
    log(initial)
    let model = await makeRecording(initial: initial, log: log, folderClaim: folderClaim, sleep: { try? await boundary.time.sleep($0) }, callAudioReady: {
        guard await access.refresh() else { return false }
        return await access.reserve()
    }, liveText: { preferences.read().liveText }, callAudioReleased: { await access.release() },
    runPiece: { id, effect in await pieces.run(id: id, effect) }, status: pieces.status)
    // The panel follows the pieces in the order Recording reduced them.
    let states = await model.states()
    let observation = Task {
        for await state in states { await pieces.observe(state) }
    }
    // The panel can still be reading finalization's speakers after Recording settles.
    let transcriptStates = await model.states()
    let transcriptCompletion = Task {
        for await state in transcriptStates where state.shutdown == .settled { break }
        transcriptOutput.continuation.finish()
    }
    // Naming follows session phases even while the panel drains the preceding call's speakers.
    let namingStates = await model.states()
    let naming = Task {
        var previous: (id: UInt64, phase: SessionState.Phase)?
        for await state in namingStates {
            guard let id = state.session?.id, let session = state.pieces,
                  previous?.id != id || previous?.phase != session.phase else { continue }
            previous = (id, session.phase)
            await panel.namesSessionChanged(id: id, phase: session.phase, hasTranscript: session.transcript != .down)
        }
    }
    var recording = RecordingInputs(send: model.send, state: model.state, states: model.states, end: {
        destination.withLock { $0 = nil }
        await model.end()
        await transcriptCompletion.value
        await observation.value
        await naming.value
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
