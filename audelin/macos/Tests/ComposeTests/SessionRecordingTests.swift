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

    @Test func endingBeforeCapturesEndsBothWaitingListeners() async throws {

        let started = Signal(), release = Signal(), listening = Signal()
        let listenersEnded = Values<SessionSide>()
        var hooks = SessionPieces.Hooks()
        hooks.textStarted = { started.send(); await release.next() }
        hooks.audioListening = { _ in listening.send() }
        hooks.audioEnded = { listenersEnded.append($0) }
        try await withSessionRig(hooks: hooks) { rig, folder in
            defer { release.end(); started.end(); listening.end() }
            rig.session.send(.begin(liveText: true))
            await started.next()
            await listening.next()
            await listening.next()
            rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ending }
            release.end()
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.isEmpty)
            #expect(Set(listenersEnded.all) == [.microphone, .call])
            #expect(rig.microphone.starts.all.isEmpty)
            #expect(rig.call.starts.all.isEmpty)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [])
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [])
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
