import Synchronization

/// Hands each subscriber the current state and then every change, in order, until finished.
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
            let id = subscribers.next
            subscribers.next += 1
            subscribers.all[id] = continuation
            return id
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

        subscribers.withLock { subscribers in
            for subscriber in subscribers.all.values { subscriber.yield(state) }
        }
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
