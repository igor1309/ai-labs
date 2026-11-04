import Composer
import PanelUI
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RecordedInputTests {

    @Test(arguments: [false, true])
    func failedStopJoinsPendingForwarding(endsInput: Bool) async throws {
        let forwarding = DrainGate()
        let source = BoundaryCapture(stopFails: true, leavesOpen: !endsInput,
                                     final: Array(boundaryTones.dropFirst()))
        let track = MemoryRecording(firstWrite: forwarding)
        defer { forwarding.release(); source.finish() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            source.give([boundaryTones[0]])
            await forwarding.waitUntilEntered()
            let returned = Values<Bool>()
            let stop = Task { try await rig.stop(); returned.append(true) }
            await source.stopped.next()
            _ = try await rig.state { $0.phase == .ending }
            #expect(source.stops.all == [true])
            #expect(returned.all.isEmpty)
            #expect(track.closed.all.isEmpty)
            forwarding.release()
            try await stop.value
            #expect(returned.all == [true])
            #expect(track.pieces.all == boundaryTones)
            #expect(await rig.mine.chunks.map { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) } == boundaryTones)
            #expect(track.closed.all == [true])
            #expect(rig.log.entries.all.contains { $0.message == "microphoneCapture.stop failed" && $0.error == "stop" })
        }
    }
}
