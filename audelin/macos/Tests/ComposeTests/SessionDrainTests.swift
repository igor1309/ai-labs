import Foundation
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionDrainTests {

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func trackClosesAfterTheHeldLastWrite(side: SessionSide, stopThrows: Bool) async throws {

        let write = DrainGate(), executor = DrainExecutor()
        let returned = Values<SessionSide>()
        var hooks = SessionPieces.Hooks()
        hooks.executor = executor
        hooks.beforeWrite = { current, audio in
            if current == side && audio.start > 0 { await write.wait() }
        }
        let configured = hooks
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withDrainRig(hooks: configured, stopFailure: stopThrows ? side : nil) { rig, folder in
                try await stopDrainCapture(rig, side: side, throwsFailure: stopThrows)
                returned.append(side)
                try await rig.pieces.stopCapture(side == .microphone ? .call : .microphone)
                try await closeDrainRig(rig)
                try await expectDrainedAudio(rig, folder: folder)
            }
        }
        defer { write.release(); executor.run() }
        await executor.run(until: { write.entered })
        #expect(write.entered)
        #expect(returned.all.isEmpty)
        write.release()
        await executor.finish()
        try await task.value
        #expect(returned.all == [side])
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func throwingStopDrainsFinishedInputThatHasNotBeenRead(side: SessionSide) async throws {

        let input = DrainGate(), executor = DrainExecutor()
        let returned = Values<SessionSide>()
        var hooks = SessionPieces.Hooks()
        hooks.executor = executor
        hooks.beforeCaptureInput = { current in
            if current == side { await input.wait() }
        }
        let configured = hooks
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withDrainRig(hooks: configured, stopFailure: side) { rig, folder in
                try await stopDrainCapture(rig, side: side, throwsFailure: true)
                returned.append(side)
                try await rig.pieces.stopCapture(side == .microphone ? .call : .microphone)
                try await closeDrainRig(rig)
                try await expectDrainedAudio(rig, folder: folder)
            }
        }
        defer { input.release(); executor.run() }
        await executor.run(until: { input.entered })
        #expect(input.entered)
        #expect(returned.all.isEmpty)
        input.release()
        await executor.finish()
        try await task.value
        #expect(returned.all == [side])
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func throwingStopEndsAnOpenStreamAndNamesTheFailure(side: SessionSide) async throws {

        try await withSessionRig(stopFailure: side, stopEndsStream: false) { rig, folder in
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            rig.session.send(.end)
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

    @Test func transcriptClosesAfterItsHeldFinalSnapshot() async throws {

        let snapshot = DrainGate(), closing = DrainGate(), executor = DrainExecutor()
        let closed = Values<Bool>()
        var hooks = SessionPieces.Hooks()
        hooks.executor = executor
        hooks.beforeTranscriptWrite = { state in
            if state.status == .finished { await snapshot.wait() }
        }
        let configured = hooks
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withDrainRig(hooks: configured) { rig, folder in
                try await rig.pieces.stopCapture(.microphone)
                try await rig.pieces.stopCapture(.call)
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                await closing.wait()
                try await rig.pieces.transcript.close()
                closed.append(true)
                _ = await rig.pieces.transcriptFeed?.result
                #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                    == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
            }
        }
        defer { snapshot.release(); closing.release(); executor.run() }
        await executor.run(until: { snapshot.entered && closing.entered })
        #expect(snapshot.entered)
        #expect(closing.entered)
        closing.release()
        executor.run()
        #expect(closed.all.isEmpty)
        snapshot.release()
        await executor.finish()
        try await task.value
        #expect(closed.all == [true])
    }
}

private func expectDrainedAudio(_ rig: SessionRig, folder: URL) async throws {

    let mine: [Float] = [0.25, -0.5, 0.125]
    let theirs: [Float] = [-0.25, 0.5, -0.125]
    #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == mine)
    #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == theirs)
    #expect(await rig.mine.chunks.flatMap(\.samples) == mine)
    #expect(await rig.theirs.chunks.flatMap(\.samples) == theirs)
}
