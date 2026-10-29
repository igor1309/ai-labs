import Compose
import IMRxObservation
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
    private let feed = StateFeed<RecordingState>()

    init(initial: RecordingState, log: @escaping @Sendable (RecordingState) -> Void) {

        let feed = feed
        model = SyncModel(initialState: initial, reduce: { state, event in
            guard !feed.finished else { return state }
            let next = RecordingReducer.reduce(state, event)
            if next != state {
                log(next)
                feed.publish(next)
            }
            return next
        })
    }

    var state: RecordingState { model.state }

    func send(_ event: RecordingEvent) { model.event(event) }

    func states() -> AsyncStream<RecordingState> { feed.subscribe(from: model.state) }

    func end() { feed.finish() }
}

/// Recording composed as the app composes it, with no state log.
func composedRecording(session: any RecordingSession, initial: RecordingState = .init()) async -> RecordingInputs {

    await makeRecording(initial, session, { _ in })
}
