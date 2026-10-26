import CallText
import Synchronization

/// Holds a side's delivery or live-text release until the test allows it.
final class CueGate: Sendable {

    private struct State {
        var open = false
        var entered = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())
    private let changed: @Sendable () -> Void

    init(changed: @escaping @Sendable () -> Void = {}) { self.changed = changed }

    var entered: Bool { state.withLock { $0.entered } }
    var isOpen: Bool { state.withLock { $0.open } }

    func wait() async {

        await withCheckedContinuation { continuation in
            let resume = state.withLock { state in
                state.entered = true
                if state.open { return true }
                state.waiting.append(continuation)
                return false
            }
            changed()
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
        changed()
    }
}

/// Runs queued jobs while side progress wakes the test driver.
final class CueExecutor: TaskExecutor {

    private let jobs = Mutex<[UnownedJob]>([])
    private let enqueued = AsyncStream<Void>.makeStream()
    private let completed = Mutex(false)

    // A child can report progress without queuing a job on this executor.
    func notify() { enqueued.continuation.yield(()) }

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        jobs.withLock { $0.append(job) }
        notify()
    }

    func complete() {

        completed.withLock { $0 = true }
        enqueued.continuation.finish()
    }

    func run(until condition: () -> Bool) async {

        var events = enqueued.stream.makeAsyncIterator()
        while !condition() && !completed.withLock({ $0 }) {
            run()
            if !condition(), await events.next() == nil { break }
        }
        run()
    }

    func finish() async {

        for await _ in enqueued.stream { run() }
        run()
    }

    func run() {

        while let job = jobs.withLock({ $0.isEmpty ? nil : $0.removeFirst() }) {
            job.runSynchronously(on: asUnownedTaskExecutor())
        }
    }
}

final class CallObservation: Sendable {

    private struct Observation {
        var latest: State?
        var ended = false
    }

    private let observation = Mutex(Observation())
    private let changed: @Sendable () -> Void

    init(changed: @escaping @Sendable () -> Void = {}) { self.changed = changed }

    var latest: State? { observation.withLock { $0.latest } }
    var ended: Bool { observation.withLock { $0.ended } }

    func listen(to call: CallText) async {

        for await snapshot in call.updates {
            observation.withLock { $0.latest = snapshot }
            changed()
        }
        observation.withLock { $0.ended = true }
        changed()
    }
}
