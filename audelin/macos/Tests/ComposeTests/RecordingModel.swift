import Compose
import IMRxObservation
import Observation
import Recording

/// Recording composed as the app composes it: the sync model on the main actor and the doer.
let makeRecording: MakeRecordingModel = { initial, session, log in

    await MainActor.run {
        let model = RecordingModel(initial: initial, log: log)
        let doer = RecordingDoer(session: session, send: { await model.send($0) })
        let acting = Task { for await state in model.states() { doer.act(on: state) } }
        return RecordingInputs(
            send: { await model.send($0) },
            state: { await model.state },
            states: { await model.states() },
            end: { acting.cancel() }
        )
    }
}

@MainActor
private final class RecordingModel {

    private let model: SyncModel<RecordingState, RecordingEvent>

    init(initial: RecordingState, log: @escaping @Sendable (RecordingState) -> Void) {

        model = SyncModel(initialState: initial, reduce: { state, event in
            let (next, _) = RecordingReducer.reduce(state, event)
            if next != state { log(next) }
            return next
        })
    }

    var state: RecordingState { model.state }

    func send(_ event: RecordingEvent) { model.event(event) }

    func states() -> AsyncStream<RecordingState> {

        let observed = Observations { [model] in model.state }
        return AsyncStream { continuation in
            let task = Task {
                for await state in observed { continuation.yield(state) }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Recording composed as the app composes it, with no state log.
func composedRecording(session: any RecordingSession, initial: RecordingState = .init()) async -> RecordingInputs {

    await makeRecording(initial, session, { _ in })
}
