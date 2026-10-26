import Preferences
import Recording

public func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces
) -> (recording: Recording, conditions: RecordingConditions) {

    let stored = preferences.read()
    let recording = composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording),
        makePieces: makePieces,
        liveText: { preferences.read().liveText }
    )
    let conditions = composeRecordingConditions(recording: recording, callsURL: stored.callsFolder)
    return (recording, conditions)
}
