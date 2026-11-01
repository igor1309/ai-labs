import BlockingTestWork
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
            await rig.session.send(.begin(liveText: true))
            let recording = try await rig.state { $0.phase == .recording }
            #expect(recording.microphoneCapture == (microphoneFails ? .down : .up))
            #expect(recording.callCapture == .up)
            #expect(rig.selections.all == [processesFail ? .allExcept([getpid()]) : .only([72, 73])])
            if !microphoneFails { await rig.mine.heard.next() }
            await rig.theirs.heard.next()

            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.count == (microphoneFails ? 1 : 0) + (processesFail ? 1 : 0))
            #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf")) == (microphoneFails ? [] : [0.25, -0.5, 0.125]))
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
            let mine = microphoneFails ? "" : "**Me** 00:00:00\nmine final\n\n"
            #expect(try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) }
                == "# Transcript\n\n" + mine + "**Them** 00:00:00\ntheirs final\n")
            #expect(await rig.mine.chunks.flatMap(\.samples) == (microphoneFails ? [] : [0.25, -0.5, 0.125]))
            #expect(await rig.theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.125])
            #expect(rig.microphone.stops.all == (microphoneFails ? [] : [true]))
            #expect(rig.call.stops.all == [true])
        }
    }

    @Test(arguments: [false, true], [nil, SessionSide.microphone, .call])
    func endingDuringBringUpKeepsAllWords(microphoneStarted: Bool, closeFailure: SessionSide?) async throws {

        let started = Signal(), release = Signal()
        var construction = SessionConstruction()
        construction.makeCallText = { text in
            ReadyCallText(text: text, afterStart: {
                if !microphoneStarted { started.send(); await release.next() }
            })
        }
        construction.closeTrack = { side, track in
            if side == closeFailure { throw ScriptFailure.failed }
            try await track.close()
        }
        try await withSessionRig(construction: construction, beforeMicrophoneStartReturns: {
            started.send()
            await release.next()
        }) { rig, folder in
            defer { started.end(); release.end() }
            await rig.session.send(.begin(liveText: true))
            await started.next()
            await rig.session.send(.end)
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
            #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf"))
                == (microphoneStarted ? [0.25, -0.5, 0.125] : []))
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [])
            #expect(try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) }
                == "# Transcript\n\n" + (microphoneStarted ? "**Me** 00:00:00\nmine final\n" : "No text was heard.\n"))
        }
    }

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func uncapturedAudioEndsAtTrackCloseBeforeTextStops(side: SessionSide, closeFails: Bool) async throws {

        let closing = Signal(), release = Signal()
        defer { closing.end(); release.end() }
        var construction = SessionConstruction()
        construction.makeCallText = { ReadyCallText(text: $0) }
        construction.closeTrack = { closingSide, track in
            if closingSide == side {
                closing.send()
                await release.next()
            }
            try await track.close()
            if closingSide == side && closeFails { throw ScriptFailure.failed }
        }
        try await withSessionRig(construction: construction) { rig, _ in
            let pieces = rig.pieces
            let folder = try await pieces.create()
            try await pieces.microphoneTrack.open(in: folder)
            try await pieces.callTrack.open(in: folder)
            try await pieces.transcript.open(in: folder)
            try await pieces.start(enabled: true)
            let text = try #require(await pieces.text)
            let recognizer = side == .microphone ? rig.mine : rig.theirs
            try await pieces.closeTrack(side == .microphone ? .call : .microphone)
            let close = Task { try await pieces.closeTrack(side) }
            await closing.next()
            #expect(await text.state.status == .listening)
            #expect(await recognizer.finishes == 0)
            release.end()
            if closeFails {
                await #expect(throws: ScriptFailure.failed) { try await close.value }
            } else {
                try await close.value
            }
            let writing = try #require(await pieces.writing)
            for await state in writing.updates {
                if state.status == .finished { break }
            }
            #expect(await text.state.status == .finished)
            #expect(await recognizer.finishes == 1)
            #expect(rig.microphone.starts.all.isEmpty)
            #expect(rig.call.starts.all.isEmpty)
            try await pieces.stop()
            try await pieces.transcript.close()
        }
    }

    @Test func liveTextSwitchesForwardToTheRunningReader() async throws {

        try await withSessionRig { rig, folder in
            await rig.session.send(.begin(liveText: false))
            _ = try await rig.state { $0.phase == .recording }
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .off)
            await rig.session.send(.liveTextChanged(true))
            _ = try await rig.state { $0.pendingLiveText == nil && $0.wantedLiveText }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            await rig.session.send(.liveTextChanged(false))
            _ = try await rig.state { $0.pendingLiveText == nil && !$0.wantedLiveText }
            #expect(await text.state.status == .off)
            await rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ended }
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
        }
    }
}
