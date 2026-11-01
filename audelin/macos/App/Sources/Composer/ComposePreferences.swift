import Foundation
import Preferences
import Recording
import CallAudioAccess
import Synchronization

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    access: AccessPolicy,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (RecordingInputs, URL) -> RecordingConditions,
    panel: AudelinPanel,
    sink: any LogSink,
    timeZone: @escaping @Sendable () -> TimeZone,
    makeModel: MakeRecordingModel,
    makeSession: @escaping MakeSessionModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    let stored = preferences.read()
    let recording = await composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording), access: access,
        makePieces: makePieces, liveText: { preferences.read().liveText },
        sink: sink, timeZone: timeZone, panel: panel, makeModel: makeModel, makeSession: makeSession
    )
    return (recording, makeConditions(recording, stored.callsFolder))
}
