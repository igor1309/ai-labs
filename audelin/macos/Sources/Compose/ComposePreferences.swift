import Foundation
import Preferences
import Recording

public func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    panel: AudelinPanel
) async -> (recording: Recording, conditions: RecordingConditions) {

    await composeRecordingWithPreferences(
        preferences: preferences, makePieces: makePieces, makeConditions: composeRecordingConditions, panel: panel
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (Recording, URL) -> RecordingConditions,
    panel: AudelinPanel
) async -> (recording: Recording, conditions: RecordingConditions) {

    let stored = preferences.read()
    let recording = await composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording),
        makePieces: makePieces,
        liveText: { preferences.read().liveText }, panel: panel
    )
    let conditions = makeConditions(recording, stored.callsFolder)
    return (recording, conditions)
}
