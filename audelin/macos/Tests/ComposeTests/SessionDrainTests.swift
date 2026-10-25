import Foundation
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionDrainTests {

    @Test func trackClosesAfterTheHeldLastWrite() async throws {

        let writing = Signal(), release = Signal(), joining = Signal()
        var hooks = SessionPieces.Hooks()
        hooks.beforeWrite = { side, audio in
            if side == .microphone && audio.start > 0 {
                writing.send()
                await release.next()
                try Task.checkCancellation()
            }
        }
        hooks.captureJoining = { if $0 == .microphone { joining.send() } }
        try await withSessionRig(hooks: hooks) { rig, folder in
            defer { writing.end(); joining.end(); release.end() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            rig.session.send(.end)
            await writing.next()
            await joining.next()
            release.end()
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.isEmpty)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
            #expect(await rig.mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
        }
    }

    @Test func transcriptClosesAfterItsHeldFinalSnapshot() async throws {

        let feeding = Signal(), release = Signal(), joining = Signal()
        var hooks = SessionPieces.Hooks()
        hooks.beforeTranscriptFeed = {
            feeding.send()
            await release.next()
            try Task.checkCancellation()
        }
        hooks.transcriptJoining = { joining.send() }
        try await withSessionRig(hooks: hooks) { rig, folder in
            defer { feeding.end(); joining.end(); release.end() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await feeding.next()
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            rig.session.send(.end)
            await joining.next()
            release.end()
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.isEmpty)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }
}
