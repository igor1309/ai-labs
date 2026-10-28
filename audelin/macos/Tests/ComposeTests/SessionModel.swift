import Compose
import IMRxObservation
import Session
import Synchronization

/// A Session composed as the app composes it: the observable model on its own actor.
let makeSession: MakeSessionModel = { handler in

    let model = SessionModel()
    await model.start(handler: handler)
    return SessionInputs(
        send: { await model.send($0) },
        states: { await model.states() },
        end: { await model.end() }
    )
}

/// Unlike the app's, its states wait until every event already sent is reduced, so a test reads
/// the state its sends produced.
actor SessionModel {

    private final class Counts: Sendable {

        let sent = Mutex(0)
        let reduced = Mutex(0)
    }

    private let counts = Counts()
    private var model: ObservableModel<SessionState, SessionEvent, SessionEffect>?
    private let feed = StateFeed<SessionState>()

    func start(handler: SessionEffectHandler, initial: SessionState = .init()) {

        let feed = feed, counts = counts
        model = ObservableModel(initialState: initial, reduce: { state, event in
            counts.reduced.withLock { $0 += 1 }
            guard !feed.finished else { return (state, nil) }
            let (next, effect) = SessionReducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { events in
                let task = Task {
                    let event = await handler.handle(effect)
                    // An effect's result is reduced like a sent event, so it is counted as one.
                    counts.sent.withLock { $0 += 1 }
                    events.yield(event)
                    events.finish()
                }
                events.onTermination = { _ in task.cancel() }
            }
        }, isolation: self)
    }

    func send(_ event: SessionEvent) {

        counts.sent.withLock { $0 += 1 }
        model?.event(event)
    }

    func states() async -> AsyncStream<SessionState> {

        while counts.reduced.withLock({ $0 }) < counts.sent.withLock({ $0 }) { await Task.yield() }
        return feed.subscribe(from: model?.state ?? .init())
    }

    func end() { feed.finish() }
}

extension SessionInputs {

    /// The current state: the first value every states stream starts with.
    func snapshot() async -> SessionState {

        var states = await states().makeAsyncIterator()
        return await states.next() ?? .init()
    }
}
