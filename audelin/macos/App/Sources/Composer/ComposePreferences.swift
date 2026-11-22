import CoreAudioProcesses
import Preferences

func composeRecordingWithPreferences(
    preferences: PreferencesStore, folderClaim: RecordingFolderClaim, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
) async -> (recording: RecordingInputs, conditions: RecordingConditionsModel) {
    let callsURL = preferences.read().callsFolder
    let recording = await composeRecording(preferences: preferences, folderClaim: folderClaim, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes,
                                            boundary: boundary, panel: panel, finalizationResources: finalizationResources, summaries: summaries)
    _ = subscribeTranscriptFinalization(recording.transcriptOutput, resources: finalizationResources, send: { await finalization.send($0) })
    return (recording, await composeRecordingConditions(recording: recording,
        callsURL: callsURL, boundary: boundary, currentFolder: { preferences.read().callsFolder }))
}
