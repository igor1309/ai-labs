import Compose
import IMRxObservation
import Reading
import Session
import Synchronization

// The app's composition of the reading and session models, so the rehearsal
// runs the same models the app does.

@MainActor
func makeReading() -> ReadingInputs {

    let model = ObservableModel<ReadingState, ReadingEvent, Never>(
        initialState: .init(), reduce: ReadingReducer.reduce, handleEffect: { switch $0 {} }
    )
    return ReadingInputs(state: { model.state }, send: { model.event($0) })
}

func makeSession(handler: SessionEffectHandler) async -> SessionInputs {

    let model = SessionModel()
    await model.start(handler: handler)
    return SessionInputs(
        send: { await model.send($0) },
        states: { await model.states() },
        end: { await model.end() }
    )
}

actor SessionModel {

    private var model: ObservableModel<SessionState, SessionEvent, SessionEffect>?
    private var ended: SessionState?
    private let feed = StateFeed<SessionState>()

    func start(handler: SessionEffectHandler) {

        let feed = feed
        model = ObservableModel(initialState: .init(), reduce: { state, event in
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
        }, isolation: self)
    }

    func send(_ event: SessionEvent) { model?.event(event) }

    func states() -> AsyncStream<SessionState> { feed.subscribe(from: model?.state ?? ended ?? .init()) }

    func end() {
        feed.finish()
        ended = model?.state
        model = nil
    }
}

/// Hands each subscriber the current state and then every change, until finished.
final class StateFeed<State: Sendable>: Sendable {

    private struct Subscribers {

        var all: [Int: AsyncStream<State>.Continuation] = [:]
        var next = 0
        var finished = false
    }

    private let subscribers = Mutex(Subscribers())

    func subscribe(from current: State) -> AsyncStream<State> {

        let (stream, continuation) = AsyncStream<State>.makeStream()
        continuation.yield(current)
        let id: Int? = subscribers.withLock { subscribers in
            guard !subscribers.finished else { return nil }
            defer { subscribers.next += 1 }
            subscribers.all[subscribers.next] = continuation
            return subscribers.next
        }
        guard let id else {
            continuation.finish()
            return stream
        }
        continuation.onTermination = { [weak self] _ in self?.subscribers.withLock { _ = $0.all.removeValue(forKey: id) } }
        return stream
    }

    var finished: Bool { subscribers.withLock { $0.finished } }

    func publish(_ state: State) {

        subscribers.withLock { for subscriber in $0.all.values { subscriber.yield(state) } }
    }

    func finish() {

        let ending = subscribers.withLock { subscribers in
            subscribers.finished = true
            defer { subscribers.all.removeAll() }
            return Array(subscribers.all.values)
        }
        for subscriber in ending { subscriber.finish() }
    }
}
