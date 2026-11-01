import Foundation
import Preferences
import Recording
import CallAudioAccess
import Synchronization

public func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    access: AccessPolicy,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel,
    makeSession: @escaping MakeSessionModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    await composeRecordingWithPreferences(
        preferences: preferences, access: access, makePieces: makePieces, makeConditions: { composeRecordingConditions(recording: $0, callsURL: $1, access: access) }, panel: panel,
        makeModel: makeModel, makeSession: makeSession
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    access: AccessPolicy,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (RecordingInputs, URL) -> RecordingConditions,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel,
    makeSession: @escaping MakeSessionModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    let stored = preferences.read()
    let recording = await composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording), access: access,
        makePieces: makePieces, liveText: { preferences.read().liveText },
        panel: panel, makeModel: makeModel, makeSession: makeSession
    )
    return (recording, makeConditions(recording, stored.callsFolder))
}
