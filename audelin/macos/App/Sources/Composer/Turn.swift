import Synchronization

/// A first-come lock that an async holder keeps across its awaits.
final class Turn: Sendable {

    private struct State {

        var taken = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }
    private let state = Mutex(State())

    func take() async {

        await withCheckedContinuation { (waiter: CheckedContinuation<Void, Never>) in
            let granted = state.withLock { state in
                guard state.taken else {
                    state.taken = true
                    return true
                }
                state.waiting.append(waiter)
                return false
            }
            if granted { waiter.resume() }
        }
    }

    func give() {

        let next = state.withLock { state -> CheckedContinuation<Void, Never>? in
            guard !state.waiting.isEmpty else {
                state.taken = false
                return nil
            }
            return state.waiting.removeFirst()
        }
        next?.resume()
    }
}

extension Turn {

    /// Runs `body` holding the turn; waiters suspend rather than block a thread.
    func run<Value>(_ body: () throws -> Value) async rethrows -> Value {

        await take()
        defer { give() }
        return try body()
    }
}
