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

    var entered: Bool { state.withLock { $0.entered } }

    func wait() async {

        await withCheckedContinuation { continuation in
            let resume = state.withLock { state in
                state.entered = true
                if state.open { return true }
                state.waiting.append(continuation)
                return false
            }
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
        enqueued.send()
    }

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
    hooks: SessionPieces.Hooks,
    stopFailure: SessionSide? = nil,
    recognizers: (any Recognizer, any Recognizer)? = nil,
    _ body: (SessionRig, URL) async throws -> Void
) async throws {

    try await withComposeFolder { root in
        let ready = DrainGate()
        defer { ready.release() }
        // Read readiness before the transcript claims the same update stream.
        var prepared = hooks
        prepared.beforeTranscriptFeed = {
            await ready.wait()
            try await hooks.beforeTranscriptFeed()
        }
        prepared.textStarted = { text in
            await hooks.textStarted(text)
            for await state in text.updates {
                if state.status == .listening { break }
            }
            ready.release()
        }
        let rig = SessionRig(
            root: root, microphoneFails: false, processesFail: false, hooks: prepared,
            stopFailure: stopFailure, stopEndsStream: true, rates: nil, recognizers: recognizers
        )
        do {
            let folder = try await rig.pieces.create()
            try await rig.pieces.microphoneTrack.open(in: folder)
            try await rig.pieces.callTrack.open(in: folder)
            try await rig.pieces.transcript.open(in: folder)
            try await rig.pieces.start(enabled: true)
            try await rig.pieces.microphoneCapture.start()
            try await rig.pieces.callCapture.start(selection: nil)
            try await body(rig, root.appendingPathComponent("1970.01.01-0000"))
            await rig.session.end()
        } catch {
            await rig.session.end()
            rig.microphone.end()
            rig.call.end()
            throw error
        }
        rig.microphone.end()
        rig.call.end()
    }
}

func stopDrainCapture(_ rig: SessionRig, side: SessionSide, throwsFailure: Bool) async throws {

    if throwsFailure {
        await #expect(throws: ScriptFailure.failed) { try await rig.pieces.stopCapture(side) }
    } else {
        try await rig.pieces.stopCapture(side)
    }
}

func closeDrainRig(_ rig: SessionRig) async throws {

    try await rig.pieces.microphoneTrack.close()
    try await rig.pieces.callTrack.close()
    try await rig.pieces.stop()
    try await rig.pieces.transcript.close()
}
