import CoreAudioProcesses
import Preferences

func composeRecordingWithPreferences(
    preferences: PreferencesStore, callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, summaries: SummaryCallbacks = .disabled
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {
    let callsURL = preferences.read().callsFolder
    let recording = await composeRecording(preferences: preferences, callApp: callApp, processes: processes,
                                            boundary: boundary, panel: panel, summaries: summaries)
    return (recording, composeRecordingConditions(recording: recording,
        callsURL: callsURL, boundary: boundary, currentFolder: { preferences.read().callsFolder }))
}
