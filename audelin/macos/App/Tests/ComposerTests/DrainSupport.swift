import Foundation
import LiveText
import Session
import Synchronization
import Testing

/// A held dependency stays held even when its caller is cancelled.
final class DrainGate: Sendable {

    private struct State {
        var open = false
        var entered = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())
    private let arrival = AsyncStream<Void>.makeStream()

    func wait() async {

        await withCheckedContinuation { continuation in
            let resume = state.withLock { state in
                state.entered = true
                if state.open { return true }
                state.waiting.append(continuation)
                return false
            }
            arrival.continuation.yield(())
            if resume { continuation.resume() }
        }
    }

    func waitUntilEntered() async {

        var iterator = arrival.stream.makeAsyncIterator()
        _ = await iterator.next()
    }

    func release() {

        let waiting = state.withLock { state in
            state.open = true
            let waiting = state.waiting
            state.waiting.removeAll()
            return waiting
        }
        for continuation in waiting { continuation.resume() }
    }
}
