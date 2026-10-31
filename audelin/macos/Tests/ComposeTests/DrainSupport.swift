import Foundation
import LiveText
import Session
import Synchronization
import Testing
@testable import Compose

/// A held dependency stays held even when its caller is cancelled.
final class DrainGate: Sendable {

    private struct State {
        var open = false
        var entered = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())
    private let onEntry: @Sendable () -> Void

    init(onEntry: @escaping @Sendable () -> Void = {}) { self.onEntry = onEntry }

    var entered: Bool { state.withLock { $0.entered } }

    func wait() async {

        await withCheckedContinuation { continuation in
            let resume = state.withLock { state in
                state.entered = true
                if state.open { return true }
                state.waiting.append(continuation)
                return false
            }
            onEntry()
            if resume { continuation.resume() }
        }
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

/// Draining the runnable work makes a held dependency the only way forward.
final class DrainExecutor: TaskExecutor {

    // A task's executor preference does not keep its executor alive, and a task
    // can outlive the test that made it, so every executor lives for the process.
    private static let kept = Mutex<[DrainExecutor]>([])

    private let jobs = Mutex<[UnownedJob]>([])
    private let enqueued = Signal()
    private let completed = Mutex(false)
    private let released = Mutex(false)

    init() { Self.kept.withLock { $0.append(self) } }

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        let released = released.withLock { released in
            if !released { jobs.withLock { $0.append(job) } }
            return released
        }
        if released {
            globalConcurrentExecutor.enqueue(ExecutorJob(job))
        } else {
            notify()
        }
    }

    /// Work enqueued after the test is done runs on its own instead of waiting forever.
    func release() {

        released.withLock { $0 = true }
        run()
    }

    func notify() { enqueued.send() }

    func complete() {

        completed.withLock { $0 = true }
        enqueued.end()
    }

    func run(until condition: () -> Bool) async {

        while !condition() && !completed.withLock({ $0 }) {
            run()
            if !condition() { await enqueued.next() }
        }
        run()
    }

    func finish() async {

        for await _ in enqueued.stream { run() }
        release()
    }

    func run() {

        while let job = jobs.withLock({ $0.isEmpty ? nil : $0.removeFirst() }) {
            job.runSynchronously(on: asUnownedTaskExecutor())
        }
    }
}

// Direct calls keep the model's effects outside the controlled task graph.
func withDrainRig(
    construction: SessionConstruction,
    recognizers: (any Recognizer, any Recognizer)? = nil,
    beforeForward: @escaping @Sendable (SessionEvent) async -> Void = { _ in },
    _ body: (SessionRig, URL) async throws -> Void
) async throws {

    try await withComposeFolder { root in
        var prepared = construction
        prepared.makeCallText = { ReadyCallText(text: $0) }
        let rig = await SessionRig(
            root: root, microphoneFails: false, processesFail: false, construction: prepared,
            stopFailure: nil, stopEndsStream: true, streamFailure: nil, rates: nil, recognizers: recognizers,
            beforeForward: beforeForward
        )
        do {
            let folder = try await rig.pieces.create()
            try await rig.pieces.microphoneTrack.open(in: folder)
            try await rig.pieces.callTrack.open(in: folder)
            try await rig.pieces.transcript.open(in: folder)
            try await rig.pieces.start(enabled: true)
            try await rig.pieces.microphoneCapture.start()
            try await rig.pieces.callCapture.start(selection: .everyAppButAudelin)
            try await body(rig, root.appendingPathComponent("1970.01.01-0000"))
            await rig.session.end()
            rig.subscription.cancel()
            await rig.subscription.value
        } catch {
            await rig.session.end()
            rig.subscription.cancel()
            await rig.subscription.value
            rig.microphone.end()
            rig.call.end()
            throw error
        }
        rig.microphone.end()
        rig.call.end()
    }
}
