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
            end: { acting.cancel(); await model.end() }
        )
    }
}

@MainActor
private final class RecordingModel {

    private let model: SyncModel<RecordingState, RecordingEvent>
    private var observers: [Int: AsyncStream<RecordingState>.Continuation] = [:]
    private var nextObserver = 0
    private var ended = false

    init(initial: RecordingState, log: @escaping @Sendable (RecordingState) -> Void) {

        model = SyncModel(initialState: initial, reduce: { state, event in
            let next = RecordingReducer.reduce(state, event)
            if next != state { log(next) }
            return next
        })
    }

    var state: RecordingState { model.state }

    func send(_ event: RecordingEvent) { model.event(event) }

    func states() -> AsyncStream<RecordingState> {

        let (stream, continuation) = AsyncStream<RecordingState>.makeStream()
        guard !ended else {
            continuation.finish()
            return stream
        }
        let observed = Observations { [model] in model.state }
        let id = nextObserver
        nextObserver += 1
        let task = Task {
            for await state in observed { continuation.yield(state) }
            continuation.finish()
        }
        observers[id] = continuation
        continuation.onTermination = { _ in task.cancel() }
        return stream
    }

    /// Finishes every states stream; later ones finish at once.
    func end() {

        ended = true
        for observer in observers.values { observer.finish() }
        observers.removeAll()
    }
}

/// Recording composed as the app composes it, with no state log.
func composedRecording(session: any RecordingSession, initial: RecordingState = .init()) async -> RecordingInputs {

    await makeRecording(initial, session, { _ in })
}
