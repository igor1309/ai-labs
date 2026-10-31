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

    /// How many events were sent and reduced. Waiting suspends rather than polls: a poll under a
    /// drain executor's preference re-enqueues forever and keeps that executor's thread.
    final class Counts: Sendable {

        private struct State {

            var sent = 0
            var reduced = 0
            var ended = false
            var waiting: [CheckedContinuation<Void, Never>] = []

            var caughtUp: Bool { ended || reduced >= sent }
        }

        private let state = Mutex(State())

        func addSent() { state.withLock { $0.sent += 1 } }

        func addReduced() { resumeWaiting { $0.reduced += 1 } }

        /// The model is gone, so whatever is unreduced stays so.
        func end() { resumeWaiting { $0.ended = true } }

        func waitUntilCaughtUp() async {

            await withCheckedContinuation { continuation in
                let caughtUp = state.withLock { state in
                    if !state.caughtUp { state.waiting.append(continuation) }
                    return state.caughtUp
                }
                if caughtUp { continuation.resume() }
            }
        }

        private func resumeWaiting(after change: (inout State) -> Void) {

            let waiting = state.withLock { state in
                change(&state)
                guard state.caughtUp else { return [CheckedContinuation<Void, Never>]() }
                defer { state.waiting = [] }
                return state.waiting
            }
            waiting.forEach { $0.resume() }
        }
    }

    private let counts = Counts()
    private var model: ObservableModel<SessionState, SessionEvent, SessionEffect>?
    // The state kept when the model is released at the end.
    private var ended: SessionState?
    private let feed = StateFeed<SessionState>()

    func start(handler: SessionEffectHandler, initial: SessionState = .init()) {

        let feed = feed, counts = counts
        model = ObservableModel(initialState: initial, reduce: { state, event in
            counts.addReduced()
            guard !feed.finished else { return (state, nil) }
            let (next, effect) = SessionReducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { events in
                let task = Task {
                    let event = await handler.handle(effect)
                    // An effect's result is reduced like a sent event, so it is counted as one.
                    counts.addSent()
                    events.yield(event)
                    events.finish()
                }
                events.onTermination = { _ in task.cancel() }
            }
        }, isolation: self)
    }

    func send(_ event: SessionEvent) {

        counts.addSent()
        model?.event(event)
    }

    func states() async -> AsyncStream<SessionState> {

        await counts.waitUntilCaughtUp()
        return feed.subscribe(from: model?.state ?? ended ?? .init())
    }

    func end() {
        feed.finish()
        // The model's loop holds this actor, so the model is released to end both.
        ended = model?.state
        model = nil
        counts.end()
    }
}

extension SessionInputs {

    /// The current state: the first value every states stream starts with.
    func snapshot() async -> SessionState {

        var states = await states().makeAsyncIterator()
        return await states.next() ?? .init()
    }
}
