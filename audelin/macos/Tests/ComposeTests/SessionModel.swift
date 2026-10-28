import Compose
import IMRxObservation
import Session

/// A Session composed as the app composes it: the observable model on the main actor.
let makeSession: MakeSessionModel = { handler in

    await MainActor.run {
        let model = SessionModel(handler: handler)
        return SessionInputs(
            send: { await model.send($0) },
            states: { await model.states() },
            end: { await model.end() }
        )
    }
}

@MainActor
final class SessionModel {

    private let model: ObservableModel<SessionState, SessionEvent, SessionEffect>
    private let feed = StateFeed<SessionState>()

    init(handler: SessionEffectHandler, initial: SessionState = .init()) {

        let feed = feed
        model = ObservableModel(initialState: initial, reduce: { state, event in
            guard !feed.finished else { return (state, nil) }
            let (next, effect) = SessionReducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { events in
                let task = Task {
                    events.yield(await handler.handle(effect))
                    events.finish()
                }
                events.onTermination = { _ in task.cancel() }
            }
        })
    }

    func send(_ event: SessionEvent) { model.event(event) }

    func states() -> AsyncStream<SessionState> { feed.subscribe(from: model.state) }

    func end() { feed.finish() }
}

extension SessionInputs {

    /// The current state: the first value every states stream starts with.
    func snapshot() async -> SessionState {

        var states = await states().makeAsyncIterator()
        return await states.next() ?? .init()
    }
}
