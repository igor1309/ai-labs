import Foundation
import Preferences
import Recording

public func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    await composeRecordingWithPreferences(
        preferences: preferences, makePieces: makePieces, makeConditions: composeRecordingConditions, panel: panel,
        makeModel: makeModel
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (RecordingInputs, URL) -> RecordingConditions,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    let stored = preferences.read()
    let recording = await composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording),
        makePieces: makePieces,
        liveText: { preferences.read().liveText }, sink: SystemLogSink(), panel: panel, makeModel: makeModel
    )
    let conditions = makeConditions(recording, stored.callsFolder)
    return (recording, conditions)
}
