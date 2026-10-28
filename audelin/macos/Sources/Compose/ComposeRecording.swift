import Recording
import Synchronization

/// Makes Recording's model from its initial state and Session; `log` receives every new state.
public typealias MakeRecordingModel = @Sendable (
    _ initial: RecordingState, _ session: any RecordingSession, _ log: @escaping @Sendable (RecordingState) -> Void
) async -> RecordingInputs

public func composeRecording(
    initial: RecordingState = .init(),
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    liveText: @escaping @Sendable () -> Bool,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel
) async -> RecordingInputs {

    await composeRecording(
        initial: initial, makePieces: makePieces, liveText: liveText, sink: SystemLogSink(), panel: panel, makeModel: makeModel
    )
}

func composeRecording(
    initial: RecordingState = .init(),
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    liveText: @escaping @Sendable () -> Bool,
    sink: any LogSink,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel
) async -> RecordingInputs {

    // Ending Recording clears the report path, which otherwise keeps the model alive through its Session.
    let destination = Mutex<RecordingInputs?>(nil)
    let sessions = RecordingSessions(makePieces: makePieces, liveText: liveText, report: { id, report in
        guard let recording = destination.withLock({ $0 }) else { return }
        Task { await recording.send(.sessionReported(id: id, report)) }
    }, connect: subscribe, sink: sink, panel: panel)
    let log = { @Sendable state in StateLog(sink: sink).recording(state) }
    log(initial)
    let model = await makeModel(initial, LoggingRecordingSession(base: sessions, sink: sink), log)
    let recording = RecordingInputs(send: model.send, state: model.state, states: model.states, end: {
        destination.withLock { $0 = nil }
        await model.end()
    })
    destination.withLock { $0 = recording }
    return recording
}
