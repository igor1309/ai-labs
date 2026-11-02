import Synchronization

/// Hands each subscriber the current state and then every change, in order, until finished.
/// The owner serializes subscription, publication and finish; cancellation may run on any thread.
final class StateFeed<State: Sendable>: Sendable {

    struct Subscriber: Sendable {

        let deliver: @Sendable (State) -> Void
        let end: @Sendable () -> Void
    }

    struct Subscribers {

        var all: [Int: Subscriber] = [:]
        var next = 0
        var finished = false
    }

    /// Never held while a subscriber is delivered to or ended: a stream ends a
    /// cancelled reader holding that reader's task lock and then removes it
    /// here, while delivering resumes the reader, taking that task lock.
    let subscribers = Mutex(Subscribers())

    func subscribe(from current: State) -> AsyncStream<State> {

        let (stream, continuation) = AsyncStream<State>.makeStream()
        continuation.yield(current)
        guard let id = register(.init(deliver: { continuation.yield($0) }, end: { continuation.finish() })) else {
            continuation.finish()
            return stream
        }
        continuation.onTermination = { [weak self] _ in self?.remove(id) }
        return stream
    }

    /// Adds a subscriber, or gives nil once the feed has finished.
    func register(_ subscriber: Subscriber) -> Int? {

        subscribers.withLock { subscribers in
            guard !subscribers.finished else { return nil }
            let id = subscribers.next
            subscribers.next += 1
            subscribers.all[id] = subscriber
            return id
        }
    }

    func remove(_ id: Int) {
        subscribers.withLock { _ = $0.all.removeValue(forKey: id) }
    }

    var finished: Bool { subscribers.withLock { $0.finished } }

    func publish(_ state: State) {

        let current = subscribers.withLock { Array($0.all.values) }
        for subscriber in current { subscriber.deliver(state) }
    }

    func finish() {

        let ending = subscribers.withLock { subscribers in
            subscribers.finished = true
            defer { subscribers.all.removeAll() }
            return Array(subscribers.all.values)
        }
        for subscriber in ending { subscriber.end() }
    }
}
