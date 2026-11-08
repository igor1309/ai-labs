import CoreAudioProcesses
import Preferences

func composeRecordingWithPreferences(
    preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
    callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary, panel: AudelinPanel, summaries: SummaryCallbacks = .disabled
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {
    let callsURL = preferences.read().callsFolder
    let recording = await composeRecording(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp, processes: processes,
                                            boundary: boundary, panel: panel, summaries: summaries)
    return (recording, composeRecordingConditions(recording: recording,
        callsURL: callsURL, boundary: boundary, currentFolder: { preferences.read().callsFolder }))
}
