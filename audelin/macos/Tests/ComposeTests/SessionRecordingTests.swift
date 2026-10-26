import Darwin
import Foundation
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionRecordingTests {

    @Test(arguments: [false, true], [false, true])
    func keepsAudioAndFinalWordsWhenEnding(microphoneFails: Bool, processesFail: Bool) async throws {

        try await withSessionRig(microphoneFails: microphoneFails, processesFail: processesFail) { rig, folder in
            rig.session.send(.begin(liveText: true))
            let recording = try await rig.state { $0.phase == .recording }
            #expect(recording.microphoneCapture == (microphoneFails ? .down : .up))
            #expect(recording.callCapture == .up)
            #expect(rig.selections.all == [processesFail ? .allExcept([getpid()]) : .only([72, 73])])
            if !microphoneFails { await rig.mine.heard.next() }
            await rig.theirs.heard.next()

            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.count == (microphoneFails ? 1 : 0) + (processesFail ? 1 : 0))
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == (microphoneFails ? [] : [0.25, -0.5, 0.125]))
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
            let mine = microphoneFails ? "" : "**Me** 00:00:00\nmine final\n\n"
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n" + mine + "**Them** 00:00:00\ntheirs final\n")
            #expect(await rig.mine.chunks.flatMap(\.samples) == (microphoneFails ? [] : [0.25, -0.5, 0.125]))
            #expect(await rig.theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.125])
            #expect(rig.microphone.stops.all == (microphoneFails ? [] : [true]))
            #expect(rig.call.stops.all == [true])
        }
    }

    @Test(arguments: [false, true], [nil, SessionSide.microphone, .call])
    func endingDuringBringUpKeepsAllWords(microphoneStarted: Bool, closeFailure: SessionSide?) async throws {

        let started = Signal(), release = Signal(), transcript = Signal()
        var hooks = SessionPieces.Hooks()
        hooks.beforeTranscriptFeed = { await transcript.next() }
        hooks.textStarted = { text in
            for await state in text.updates {
                if state.status == .listening { break }
            }
            transcript.end()
            if !microphoneStarted { started.send(); await release.next() }
        }
        hooks.closeTrack = { side, track in
            if side == closeFailure { throw ScriptFailure.failed }
            try await track.close()
        }
        try await withSessionRig(hooks: hooks, beforeMicrophoneStartReturns: {
            started.send()
            await release.next()
        }) { rig, folder in
            defer { started.end(); release.end(); transcript.end() }
            rig.session.send(.begin(liveText: true))
            await started.next()
            rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ending }
            release.end()
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == closeFailure.map { [SessionFailure(piece: "\($0) track", message: "failed")] } ?? [])
            #expect(ended.microphoneTrack == .closed)
            #expect(ended.callTrack == .closed)
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .finished)
            #expect(rig.microphone.starts.all == (microphoneStarted ? [true] : []))
            #expect(rig.microphone.stops.all == (microphoneStarted ? [true] : []))
            #expect(rig.call.starts.all.isEmpty)
            #expect(rig.call.stops.all.isEmpty)
            #expect(await rig.mine.chunks.flatMap(\.samples) == (microphoneStarted ? [0.25, -0.5, 0.125] : []))
            #expect(await rig.theirs.chunks.isEmpty)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf"))
                == (microphoneStarted ? [0.25, -0.5, 0.125] : []))
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [])
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n" + (microphoneStarted ? "**Me** 00:00:00\nmine final\n" : "No text was heard.\n"))
        }
    }

    @Test func liveTextSwitchesForwardToTheRunningReader() async throws {

        try await withSessionRig { rig, folder in
            rig.session.send(.begin(liveText: false))
            _ = try await rig.state { $0.phase == .recording }
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .off)
            rig.session.send(.liveTextChanged(true))
            _ = try await rig.state { $0.pendingLiveText == nil && $0.wantedLiveText }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            rig.session.send(.liveTextChanged(false))
            _ = try await rig.state { $0.pendingLiveText == nil && !$0.wantedLiveText }
            #expect(await text.state.status == .off)
            rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ended }
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
        }
    }
}
