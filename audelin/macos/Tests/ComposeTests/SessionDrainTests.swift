import Foundation
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionDrainTests {

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

    @Test func stopWaitsForFinalTranscriptWriteAndCloseKeepsText() async throws {

        let executor = DrainExecutor()
        let snapshot = DrainGate(onEntry: executor.notify)
        let stopped = Values<Bool>()
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
