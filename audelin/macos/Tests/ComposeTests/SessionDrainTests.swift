import Foundation
import Session
import Testing
import TranscriptFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionDrainTests {

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func captureStopWaitsForDeferredAudioDelivery(side: SessionSide, stopFails: Bool) async throws {

        let executor = DrainExecutor()
        let delivery = DrainGate(onEntry: executor.notify)
        let stopped = Values<Bool>(), captureStops = Values<Bool>(), resumed = Values<Bool>()
        let stopExecutor = CaptureStopExecutor(base: executor, captureStops: captureStops, resumed: resumed)
        var construction = SessionConstruction()
        construction.executor = executor
        construction.makeCallText = { ReadyCallText(text: $0) }
        construction.makeCaptureAudio = { _, live in
            HeldCaptureAudio(base: LiveCaptureAudio(capture: live), release: { await delivery.wait() })
        }
        let configured = construction
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withSessionRig(construction: configured, stopFailure: stopFails ? side : nil) { rig, _ in
                let folder = try await rig.pieces.create()
                try await rig.pieces.microphoneTrack.open(in: folder)
                try await rig.pieces.callTrack.open(in: folder)
                try await rig.pieces.start(enabled: true)
                if side == .microphone {
                    try await rig.pieces.microphoneCapture.start()
                    rig.microphone.source.continuation.onTermination = { _ in captureStops.append(true) }
                } else {
                    try await rig.pieces.callCapture.start(selection: .everyAppButAudelin)
                    rig.call.source.continuation.onTermination = { _ in captureStops.append(true) }
                }
                let stop = Task(executorPreference: stopExecutor) {
                    if stopFails {
                        await #expect(throws: ScriptFailure.failed) { try await rig.pieces.stopCapture(side) }
                    } else {
                        try await rig.pieces.stopCapture(side)
                    }
                    stopped.append(true)
                }
                try await stop.value
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                let recognizer = side == .microphone ? rig.mine : rig.theirs
                let chunks = await recognizer.chunks
                let expected: [Float] = side == .microphone ? [0.25, -0.5, 0.125] : [-0.25, 0.5, -0.125]
                #expect(chunks.flatMap(\.samples) == expected)
            }
        }
        defer { delivery.release(); executor.run() }
        await executor.run(until: { delivery.entered && !resumed.all.isEmpty })
        #expect(delivery.entered)
        #expect(captureStops.all == [true])
        #expect(!resumed.all.isEmpty)
        #expect(stopped.all.isEmpty)
        delivery.release()
        await executor.finish()
        try await task.value
        #expect(stopped.all == [true])
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func throwingStopEndsAnOpenStreamAndNamesTheFailure(side: SessionSide) async throws {

        try await withSessionRig(stopFailure: side, stopEndsStream: false) { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == [SessionFailure(piece: "\(side) capture", message: "failed")])
            #expect(ended.microphoneTrack == .closed)
            #expect(ended.callTrack == .closed)
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
        }
    }

    @Test func stopWaitsForFinalTranscriptWriteAndCloseKeepsText() async throws {

        let executor = DrainExecutor()
        let snapshot = DrainGate(onEntry: executor.notify)
        let stopped = Values<Bool>()
        var construction = SessionConstruction()
        construction.executor = executor
        construction.openTranscript = { url in
            ControlledTranscript(base: try WritingTranscript(file: TranscriptFile(url: url)), beforeWrite: { state in
                if state.status == .finished { await snapshot.wait() }
            })
        }
        let configured = construction
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withDrainRig(construction: configured) { rig, folder in
                try await rig.pieces.stopCapture(.microphone)
                try await rig.pieces.stopCapture(.call)
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                stopped.append(true)
                let url = folder.appendingPathComponent("transcript.md")
                let expected = "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n"
                #expect(try String(contentsOf: url, encoding: .utf8) == expected)
                try await rig.pieces.transcript.close()
                #expect(try String(contentsOf: url, encoding: .utf8) == expected)
            }
        }
        defer { snapshot.release(); executor.run() }
        await executor.run(until: { snapshot.entered })
        #expect(snapshot.entered)
        #expect(stopped.all.isEmpty)
        snapshot.release()
        await executor.finish()
        try await task.value
        #expect(stopped.all == [true])
    }
}

/// The stop caller resumes only after recording shutdown has joined its own tasks.
private final class CaptureStopExecutor: TaskExecutor {

    let base: DrainExecutor
    let captureStops: Values<Bool>
    let resumed: Values<Bool>

    init(base: DrainExecutor, captureStops: Values<Bool>, resumed: Values<Bool>) {

        self.base = base
        self.captureStops = captureStops
        self.resumed = resumed
    }

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        let afterCaptureStop = !captureStops.all.isEmpty
        Task(executorPreference: base) {
            if afterCaptureStop { self.resumed.append(true) }
            job.runSynchronously(on: self.asUnownedTaskExecutor())
        }
    }
}
