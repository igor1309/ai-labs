import CoreAudioProcesses
import Preferences

func composeRecordingWithPreferences(
    preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
) async -> (recording: RecordingInputs, conditions: RecordingConditionsModel) {
    let callsURL = preferences.read().callsFolder
    var recording = await composeRecording(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes,
                                            boundary: boundary, panel: panel, finalizationResources: finalizationResources, summaries: summaries)
    let delivery = subscribeTranscriptFinalization(recording.transcriptOutput, send: { await finalization.send($0) })
    recording.drainTranscriptOutput = { await delivery.value }
    return (recording, await composeRecordingConditions(recording: recording,
        callsURL: callsURL, boundary: boundary, currentFolder: { preferences.read().callsFolder }))
}
