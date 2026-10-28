import CallText
import Synchronization

/// Holds a side's delivery or live-text release until the test allows it.
final class CueGate: Sendable {

    private struct State {
        var open = false
        var entered = false
        var waiting: [CheckedContinuation<Void, Never>] = []
        var entryWaiting: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())

    func wait() async {

        await withCheckedContinuation { continuation in
            let (resume, entryWaiting) = state.withLock { state in
                state.entered = true
                let entryWaiting = state.entryWaiting
                state.entryWaiting.removeAll()
                if state.open { return (true, entryWaiting) }
                state.waiting.append(continuation)
                return (false, entryWaiting)
            }
            for waiter in entryWaiting { waiter.resume() }
            if resume { continuation.resume() }
        }
    }

    func waitUntilEntered() async {

        await withCheckedContinuation { continuation in
            let resume = state.withLock { state in
                if state.entered { return true }
                state.entryWaiting.append(continuation)
                return false
            }
            if resume { continuation.resume() }
        }
    }

    func open() {

        let waiting = state.withLock { state in
            state.open = true
            let waiting = state.waiting
            state.waiting.removeAll()
            return waiting
        }
        for continuation in waiting { continuation.resume() }
    }
}

final class CallObservation: Sendable {

    private struct Observation {
        var latest: State?
        var ended = false
        var waiting: [(snapshot: State, received: CheckedContinuation<Void, Never>)] = []
    }

    private let observation = Mutex(Observation())

    var latest: State? { observation.withLock { $0.latest } }
    var ended: Bool { observation.withLock { $0.ended } }

    func wait(for snapshot: State) async {

        await withCheckedContinuation { received in
            let resume = observation.withLock { observation in
                if observation.latest == snapshot { return true }
                observation.waiting.append((snapshot, received))
                return false
            }
            if resume { received.resume() }
        }
    }

    func listen(to call: CallText) async {

        for await snapshot in call.updates {
            let received = observation.withLock { observation in
                observation.latest = snapshot
                let received = observation.waiting.filter { $0.snapshot == snapshot }.map(\.received)
                observation.waiting.removeAll { $0.snapshot == snapshot }
                return received
            }
            for continuation in received { continuation.resume() }
        }
        observation.withLock { $0.ended = true }
    }
}
