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

    private let jobs = Mutex<[UnownedJob]>([])
    private let enqueued = Signal()
    private let completed = Mutex(false)

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        jobs.withLock { $0.append(job) }
        notify()
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
        run()
    }

    func run() {

        while let job = jobs.withLock({ $0.isEmpty ? nil : $0.removeFirst() }) {
            job.runSynchronously(on: asUnownedTaskExecutor())
        }
    }
}

// Direct calls keep Machine's detached effects outside the controlled task graph.
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
