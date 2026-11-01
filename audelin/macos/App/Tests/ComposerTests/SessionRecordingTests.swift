import BlockingTestWork
import Composer
import Darwin
import Foundation
import PanelUI
import Recording
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionRecordingTests {
    @Test(arguments: [false, true])
    func keepsAudioAndFinalWordsWhenEnding(microphoneFails: Bool) async throws {
        try await withComposition(microphoneFails: microphoneFails) { rig in
            try await rig.start()
            if !microphoneFails { await rig.mine.heard.next() }
            await rig.theirs.heard.next()
            let state = try await rig.state { microphoneFails ? $0.faults.contains(.microphone) : $0.phase == .recording }
            #expect(state.faults == (microphoneFails ? [.microphone] : []))
            #expect(rig.selections.all == [.allExcept([getpid()])])
            try await rig.stop()
            let folder = rig.folder()
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

    @Test func endingDuringBringUpKeepsAllWords() async throws {
        let started = Signal(), release = DrainGate()
        defer { started.end(); release.release() }
        try await withComposition(configure: { boundary in
            let microphone = boundary.microphone
            boundary.microphone = FixtureMicrophone(begin: {
                let capture = try await microphone.start()
                started.send(); await release.wait()
                return capture
            })
        }) { rig in
            await rig.menu.perform(.start)
            await started.next()
            let beginning = try await rig.state { $0.callID != nil }
            #expect(beginning.phase == .beginning)
            #expect(beginning.callID == "1970.01.01-0000")
            await rig.menu.perform(.stop)
            _ = try await rig.state { $0.phase == .ending }
            #expect(rig.microphone.stops.all.isEmpty)
            release.release()
            let ended = try await rig.state { $0.phase == .idle }
            #expect(ended.callID == nil)
            #expect(rig.microphone.starts.all == [true])
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.starts.all.isEmpty)
            #expect(rig.call.stops.all.isEmpty)
            #expect(await rig.mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
            #expect(await rig.theirs.chunks.isEmpty)
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("call.caf")) == [])
        }
    }

    @Test func liveTextSwitchesForwardToTheRunningReader() async throws {
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .liveTextOff = $0.log { true } else { false } }
            #expect(await rig.mine.chunks.isEmpty)
            await rig.menu.sendPanel(.switchLiveTextOn)
            await rig.mine.heard.next(); await rig.theirs.heard.next()
            let listening = try await rig.panel { if case let .lines(lines) = $0.log { lines.entries.count == 2 } else { false } }
            if case let .lines(lines) = listening.log {
                #expect(Set(lines.entries.map(\.pending)) == ["mine pending", "theirs pending"])
            }
            try await rig.stop()
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
        }
    }

    @Test(arguments: [ComposerSide.microphone, .call])
    func throwingStopEndsAnOpenStreamAndNamesTheFailure(side: ComposerSide) async throws {
        try await withComposition(stopFailure: side, stopEndsStream: false) { rig in
            try await rig.start()
            await rig.mine.heard.next(); await rig.theirs.heard.next()
            try await rig.stop()
            #expect(rig.log.entries.all.contains { $0.category == .session && $0.error?.contains("\(side) capture: failed") == true })
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
            #expect(await rig.mine.finishes == 1)
            #expect(await rig.theirs.finishes == 1)
        }
    }

    @Test func recordingWiringForwardsLaterFailureAndEndsTheSession() async throws {
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            rig.microphone.source.continuation.finish(throwing: ScriptFailure.failed)
            rig.call.source.continuation.finish(throwing: ScriptFailure.failed)
            let ended = try await rig.state { $0.phase == .idle }
            #expect(ended.cannotRecord == "no track can record")
            #expect(ended.session == nil)
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("microphone.caf")) == [0.25, -0.5])
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("call.caf")) == [-0.25, 0.5])
        }
    }
}
