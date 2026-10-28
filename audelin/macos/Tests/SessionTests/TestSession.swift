import IMRxObservation
import Session
import Synchronization

/// A Session composed as the app composes it, plus what the tests wait on: a snapshot that
/// includes every event sent or delivered so far, and the effects still running.
@MainActor
final class TestSession {

    private final class Tracker: Sendable {

        let lock = Mutex(Progress())
    }

    fileprivate struct Progress {

        var queued = 0
        var reduced = 0
        var effects: [Int: Task<Void, Never>] = [:]
        var nextEffect = 0
        var subscribers: [Int: AsyncStream<SessionState>.Continuation] = [:]
        var nextSubscriber = 0
        var ended = false
    }

    private var model: ObservableModel<SessionState, SessionEvent, SessionEffect>!
    private let progress = Tracker()

    init(handler: SessionEffectHandler, initial: SessionState = .init()) {

        let progress = progress
        model = ObservableModel(initialState: initial, reduce: { state, event in
            let ended = progress.lock.withLock { progress in
                progress.reduced += 1
                return progress.ended
            }
            guard !ended else { return (state, nil) }
            let (next, effect) = SessionReducer.reduce(state, event)
            progress.lock.withLock { progress in
                if next != state { for subscriber in progress.subscribers.values { subscriber.yield(next) } }
            }
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { events in
                let tracker = progress
                tracker.lock.withLock { progress in
                    let id = progress.nextEffect
                    progress.nextEffect += 1
                    progress.effects[id] = Task {
                        let event = await handler.handle(effect)
                        tracker.lock.withLock { progress in
                            progress.queued += 1
                            progress.effects[id] = nil
                        }
                        events.yield(event)
                        events.finish()
                    }
                }
            }
        })
    }

    func send(_ event: SessionEvent) {

        progress.lock.withLock { $0.queued += 1 }
        model.event(event)
    }

    /// The state after every event already sent, or delivered by a finished effect, is reduced.
    func snapshot() async -> SessionState {

        while progress.lock.withLock({ $0.reduced < $0.queued }) { await Task.yield() }
        return model.state
    }

    /// Starts with the current state and retains every subsequent change.
    func states() -> AsyncStream<SessionState> {

        let (stream, continuation) = AsyncStream<SessionState>.makeStream()
        continuation.yield(model.state)
        let id = progress.lock.withLock { progress in
            let id = progress.nextSubscriber
            progress.nextSubscriber += 1
            progress.subscribers[id] = continuation
            return id
        }
        continuation.onTermination = { [progress] _ in progress.lock.withLock { _ = $0.subscribers.removeValue(forKey: id) } }
        return stream
    }

    /// Waits for the effects running now; their results are then queued.
    func waitForEffects() async {

        let running = progress.lock.withLock { Array($0.effects.values) }
        for effect in running { await effect.value }
    }

    /// Finishes every states stream; later events change nothing.
    func end() {

        let subscribers = progress.lock.withLock { progress in
            progress.ended = true
            defer { progress.subscribers.removeAll() }
            return Array(progress.subscribers.values)
        }
        for subscriber in subscribers { subscriber.finish() }
    }
}
