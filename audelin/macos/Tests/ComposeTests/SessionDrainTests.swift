import Foundation
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionDrainTests {

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func trackClosesAfterTheHeldLastWrite(side: SessionSide, stopThrows: Bool) async throws {

        let writing = Signal(), release = Signal()
        let joined = Values<SessionSide>()
        var hooks = SessionPieces.Hooks()
        hooks.beforeWrite = { current, audio in
            if current == side && audio.start > 0 {
                writing.send()
                await release.next()
                try Task.checkCancellation()
            }
        }
        hooks.joinCapture = { current, feed in
            if current == side { release.end() }
            try await feed.wait()
            joined.append(current)
        }
        try await withSessionRig(
            hooks: hooks, stopFailure: stopThrows ? side : nil,
            beforeStopReturns: { if $0 == side { await writing.next() } }
        ) { rig, folder in
            defer { writing.end(); release.end() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            // A missing join must fail on closed-file output rather than strand the held write.
            let closing = Task {
                _ = try? await rig.state { (side == .microphone ? $0.microphoneTrack : $0.callTrack) == .closed }
                release.end()
            }
            defer { closing.cancel() }
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            await closing.value
            #expect(ended.failures == (stopThrows ? [SessionFailure(piece: "\(side) capture", message: "failed")] : []))
            #expect(Set(joined.all) == [.microphone, .call])
            let name = side == .microphone ? "microphone.caf" : "call.caf"
            let expected: [Float] = side == .microphone ? [0.25, -0.5, 0.125] : [-0.25, 0.5, -0.125]
            #expect(try recordedSamples(folder.appendingPathComponent(name)) == expected)
            let chunks = side == .microphone ? await rig.mine.chunks : await rig.theirs.chunks
            #expect(chunks.flatMap(\.samples) == expected)
        }
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

        let feeding = Signal(), release = Signal()
        let joined = Values<Bool>()
        var hooks = SessionPieces.Hooks()
        hooks.beforeTranscriptFeed = {
            feeding.send()
            await release.next()
            try Task.checkCancellation()
        }
        hooks.joinTranscript = { task in
            release.end()
            let result = await task.result
            joined.append(true)
            return result
        }
        try await withSessionRig(hooks: hooks) { rig, folder in
            defer { feeding.end(); release.end() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await feeding.next()
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            release.end()
            _ = await rig.pieces.transcriptFeed?.result
            #expect(ended.failures.isEmpty)
            #expect(joined.all == [true])
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }
}
