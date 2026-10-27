import Foundation
import Preferences
import Recording

public func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces
) -> (recording: Recording, conditions: RecordingConditions) {

    composeRecordingWithPreferences(
        preferences: preferences, makePieces: makePieces, makeConditions: composeRecordingConditions
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (Recording, URL) -> RecordingConditions
) -> (recording: Recording, conditions: RecordingConditions) {

    let stored = preferences.read()
    let recording = composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording),
        makePieces: makePieces,
        liveText: { preferences.read().liveText }
    )
    let conditions = makeConditions(recording, stored.callsFolder)
    return (recording, conditions)
}
