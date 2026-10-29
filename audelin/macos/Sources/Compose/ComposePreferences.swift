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
        preferences: preferences, makePieces: makePieces, makeConditions: { composeRecordingConditions(recording: $0, callsURL: $1, access: access) }, panel: panel,
        makeModel: makeModel, makeSession: makeSession
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (RecordingInputs, URL) -> RecordingConditions,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel,
    makeSession: @escaping MakeSessionModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    let stored = preferences.read()
    let checker = Mutex<RecordingConditions?>(nil)
    let raw = Mutex<RecordingInputs?>(nil)
    let recording = await composeRecording(
        initial: RecordingState(automatic: stored.automaticRecording),
        makePieces: makePieces,
        liveText: { preferences.read().liveText }, sink: SystemLogSink(), decorate: { model in
            raw.withLock { $0 = model }
            return RecordingInputs(send: { event in
                if let conditions = checker.withLock({ $0 }) { await conditions.deliver(event, to: model) }
                else { await model.send(event) }
            }, state: model.state, states: model.states, end: {
                checker.withLock { $0 = nil }
                await model.end()
            }, connectReports: model.connectReports)
        }, panel: panel, makeModel: makeModel,
        makeSession: makeSession
    )
    let conditions = makeConditions(raw.withLock { $0! }, stored.callsFolder)
    checker.withLock { $0 = conditions }
    return (recording, conditions)
}
