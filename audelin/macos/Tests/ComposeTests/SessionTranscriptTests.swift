import Foundation
import Session
import Synchronization
import Testing
import TranscriptFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionTranscriptTests {

    @Test func writeFailureIsTranscriptNewsAndRecordingContinues() async throws {

        let failed = Mutex(false)
        let news = Values<String>()
        var hooks = SessionPieces.Hooks()
        hooks.beforeTranscriptWrite = { state in
            if state.entries.count == 2, !failed.withLock({ value in
                let previous = value
                value = true
                return previous
            }) { throw ScriptFailure.failed }
        }
        try await withSessionRig(hooks: hooks, beforeForward: { event in
            if case let .pieceFailed(.transcript, error) = event { news.append(error) }
        }) { rig, folder in
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            let state = try await rig.state { $0.health(of: .transcript) == .failed("failed") }
            #expect(news.all == ["failed"])
            #expect(state.failures == [.init(piece: "transcript", message: "failed")])
            #expect(state.phase == .recording)
            #expect(state.microphoneCapture == .up)
            #expect(state.callCapture == .up)
            #expect(state.health(of: .callText) == .fine)
            #expect(rig.microphone.stops.all.isEmpty)
            #expect(rig.call.stops.all.isEmpty)
            rig.microphone.source.continuation.yield(.init(samples: [0.625], sampleRate: 48_000))
            rig.call.source.continuation.yield(.init(samples: [-0.625], sampleRate: 48_000))
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == state.failures)
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.625, 0.125])
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.625, -0.125])
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }

    @Test func lastWriteFailureReachesNewsAndCloseSucceeds() async throws {

        let news = Values<String>(), reported = Signal()
        defer { reported.end() }
        var hooks = SessionPieces.Hooks()
        hooks.beforeTranscriptWrite = { state in
            if state.status == .finished { throw ScriptFailure.failed }
        }
        try await withSessionRig(hooks: hooks, beforeForward: { event in
            if case let .pieceFailed(.transcript, error) = event {
                news.append(error)
                reported.send()
            }
        }) { rig, _ in
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            await reported.next()
            #expect(news.all == ["failed"])
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            #expect(await rig.pieces.textStopped == true)
        }
    }

    @Test(arguments: [false, true])
    func failedTranscriptOpenStillStartsSwitchesAndStopsCallText(enabled: Bool) async throws {

        var hooks = SessionPieces.Hooks()
        hooks.openTranscript = { url in
            try Data("existing transcript".utf8).write(to: url)
            return try TranscriptFile(url: url)
        }
        try await withSessionRig(hooks: hooks) { rig, folder in
            rig.session.send(.begin(liveText: enabled))
            let recording = try await rig.state { $0.phase == .recording }
            #expect(recording.failures.map(\.piece) == ["transcript"])
            #expect(recording.callText == .up)
            #expect(await rig.pieces.transcriptFile == nil)
            let text = try #require(await rig.pieces.text)
            if !enabled { #expect(await text.state.status == .off) }
            rig.session.send(.liveTextChanged(!enabled))
            _ = try await rig.state { $0.pendingLiveText == nil && $0.wantedLiveText == !enabled }
            if enabled { #expect(await text.state.status == .off) }
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == recording.failures)
            #expect(ended.callText == .closed)
            #expect(await text.state.status == .finished)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "existing transcript")
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.stops.all == [true])
        }
    }
}
