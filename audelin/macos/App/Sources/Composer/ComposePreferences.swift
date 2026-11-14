import CoreAudioProcesses
import Preferences

func composeRecordingWithPreferences(
    preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
) async -> (recording: RecordingInputs, conditions: RecordingConditionsModel) {
    let callsURL = preferences.read().callsFolder
    let recording = await composeRecording(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes,
                                            boundary: boundary, panel: panel, finalization: finalization, finalizationResources: finalizationResources, summaries: summaries)
    return (recording, await composeRecordingConditions(recording: recording,
        callsURL: callsURL, boundary: boundary, currentFolder: { preferences.read().callsFolder }))
}
