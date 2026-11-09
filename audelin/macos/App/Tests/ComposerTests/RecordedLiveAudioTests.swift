import Composer
import LiveText
import PanelUI
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RecordedLiveAudioTests {

    @Test(arguments: [1, 2])
    func failedWriteStillDeliversItsAudio(failingWrite: Int) async throws {
        let source = BoundaryCapture(), track = MemoryRecording(failingWrite: failingWrite)
        defer { source.finish() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            let given = Array(boundaryTones.prefix(failingWrite))
            source.give(given)
            _ = try await rig.state { $0.faults == [.diskFull] }
            await source.stopped.next()
            try await rig.stop()
            #expect(await rig.mine.chunks.map { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) } == given)
            #expect(track.pieces.all == Array(given.dropLast()))
            #expect(source.stops.all == [true])
            #expect(track.closed.all == [true])
            let failures = rig.log.entries.all.filter { $0.category == .session && $0.error?.contains("microphone track: write") == true }
            #expect(!failures.isEmpty)
        }
    }

    @Test func liveAudioAndItsTimePassAHeldWrite() async throws {
        let held = DrainGate(), source = BoundaryCapture()
        let track = MemoryRecording(firstWrite: held)
        defer { source.finish(); held.release() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            source.give(boundaryTones)
            await held.waitUntilEntered()
            for _ in boundaryTones { await rig.mine.heard.next() }
            #expect(await rig.mine.chunks.map { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) } == boundaryTones)
            #expect(track.pieces.all.isEmpty)
            let stop = Task { try await rig.stop() }
            await source.stopped.next()
            _ = try await rig.state { $0.phase == .ending }
            #expect(track.closed.all.isEmpty)
            held.release()
            try await stop.value
            #expect(track.pieces.all == boundaryTones)
            #expect(track.closed.all == [true])
            #expect(await rig.mine.finishes == 1)
            #expect(source.stops.all == [true])
            #expect(rig.log.entries.all.contains { $0.category == .capture && $0.message == "microphone stream stopped pieces=3 frames=9" })
            #expect(rig.log.entries.all.filter { $0.category == .session && $0.error != nil && !$0.message.hasPrefix("state ") } == [
                .init(category: .session, message: "processes.select failed", error: "noCallApp"),
            ])
        }
    }

    @Test func captureFailureReachesRecordingAfterEveryTone() async throws {
        let source = BoundaryCapture(), track = MemoryRecording()
        defer { source.finish() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            source.give(boundaryTones)
            source.finish(.capture)
            _ = try await rig.state { $0.faults == [.microphone] }
            try await rig.stop()
            #expect(await rig.mine.chunks.map { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) } == boundaryTones)
            #expect(track.pieces.all == boundaryTones)
            #expect(source.stops.all == [true])
            #expect(rig.log.entries.all.contains { $0.category == .session && $0.error?.contains("microphone capture: capture") == true })
        }
    }

    @Test(arguments: [false, true])
    func failedStopKeepsEveryToneAndReportsOnlyStop(leavesOpen: Bool) async throws {
        let source = BoundaryCapture(stopFails: true, leavesOpen: leavesOpen, final: boundaryTones)
        let track = MemoryRecording()
        defer { source.finish() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            try await rig.stop()
            #expect(await rig.mine.chunks.map { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) } == boundaryTones)
            #expect(track.pieces.all == boundaryTones)
            #expect(source.stops.all == [true])
            #expect(track.closed.all == [true])
            #expect(rig.log.entries.all.filter { $0.category == .session && $0.error != nil && !$0.message.hasPrefix("state ") } == [
                .init(category: .session, message: "processes.select failed", error: "noCallApp"),
                .init(category: .session, message: "microphoneCapture.stop failed", error: "stop"),
            ])
        }
    }
}
