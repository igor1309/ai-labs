import Composer
import LiveText
import Testing

/// Through the session: text listens before the capture exists when Live text
/// is on, and after it has been attached when Live text comes on later.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct DeferredAudioCompositionTests {

    @Test func audioReachesTextThatListenedBeforeTheCaptureWasMade() async throws {

        let held = DrainGate()
        defer { held.release() }
        let mine = SessionRecognizer(name: "mine")
        try await withComposition(recognizers: (mine, SessionRecognizer(name: "theirs")), configure: { boundary in
            let microphone = boundary.microphone
            boundary.microphone = FixtureMicrophone {
                await held.wait()
                return try await microphone.start()
            }
        }) { rig in
            await rig.menu.perform(.start)
            await held.waitUntilEntered()
            await rig.log.wait { $0.message == "callText.start enabled=true succeeded" }
            #expect(await mine.chunks.isEmpty)
            held.release()
            _ = try await rig.state { $0.phase == .recording }
            await mine.heard.next()
            #expect(await mine.chunks.first?.samples == [0.25, -0.5])
            try await rig.stop()
            #expect(await mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
            #expect(await mine.finishes == 1)
        }
    }

    @Test func audioReachesTextSwitchedOnAfterTheCaptureWasAttached() async throws {

        let mine = SessionRecognizer(name: "mine")
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) },
            recognizers: (mine, SessionRecognizer(name: "theirs"))) { rig in
            try await rig.start()
            #expect(await mine.chunks.isEmpty)
            await rig.menu.sendPanel(.switchLiveTextOn)
            await mine.heard.next()
            #expect(await mine.chunks.flatMap(\.samples).starts(with: [0.25, -0.5]))
            try await rig.stop()
            #expect(await mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
            #expect(await mine.finishes == 1)
        }
    }

    @Test(arguments: [false, true])
    func aListenerWithoutAudioEndsOnFailedBringUpOrStop(stopDuringBringUp: Bool) async throws {
        let starting = DrainGate()
        defer { starting.release() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone {
                if stopDuringBringUp { await starting.wait() }
                throw ScriptFailure.failed
            }
        }) { rig in
            await rig.menu.perform(.start)
            if stopDuringBringUp {
                await starting.waitUntilEntered()
                await rig.menu.perform(.stop)
                _ = try await rig.state { $0.phase == .ending }
                starting.release()
                _ = try await rig.state { $0.phase == .idle }
            } else {
                _ = try await rig.state { $0.phase == .recording }
                try await rig.stop()
            }
            #expect(await rig.mine.chunks.isEmpty)
            #expect(rig.microphone.starts.all.isEmpty)
            #expect(rig.call.starts.all == (stopDuringBringUp ? [] : [true]))
            await rig.log.wait { $0.message == "end id=1 finished" }
            #expect(rig.log.entries.all.contains { $0.message == "end id=1 finished" })
        }
    }

    @Test func captureProgressIncludesAudioWhileTextPreparationIsBlocked() async throws {
        let preparing = DrainGate(), source = BoundaryCapture()
        let kept = (1...25).map { Float($0) / 100 }
        let track = MemoryRecording(readSamples: kept)
        defer { preparing.release(); source.finish() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
            let recognizers = boundary.recognizers
            boundary.recognizers = FixtureRecognizers(source: { side in
                if side == .microphone { await preparing.wait() }
                return try await recognizers.recognizer(for: side)
            }, missing: recognizers.missingModels, load: recognizers.startLoading)
        }) { rig in
            try await rig.start()
            await preparing.waitUntilEntered()
            source.give(boundaryTones)
            await track.waitForPieces(3)
            #expect(await rig.mine.chunks.isEmpty)
            #expect(track.pieces.all == boundaryTones)
            preparing.release()
            await rig.mine.heard.next()
            #expect(track.reads.all == [0..<(2 / 8_000.0 + 3 / 16_000.0 + 4 / 48_000.0)])
            #expect(await rig.mine.chunks.first?.samples == kept)
            #expect(await rig.mine.chunks.first?.sampleRate == 48_000)
            try await rig.stop()
            #expect(await rig.mine.chunks.flatMap(\.samples) == kept)
            #expect(await rig.mine.finishes == 1)
            #expect(track.closed.all == [true])
        }
    }

    @Test func recordingDrainsWhileTheAudioListenerIsBlocked() async throws {
        let listening = DrainGate(), source = BoundaryCapture(), track = MemoryRecording()
        let mine = HeldAudioRecognizer(listening: listening)
        defer { listening.release(); source.finish() }
        try await withComposition(recognizers: (mine, SessionRecognizer(name: "theirs")), configure: { boundary in
            boundary.microphone = FixtureMicrophone { source.start() }
            boundary.recordings = FixtureRecordings(microphone: track, call: MemoryRecording())
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            source.give([boundaryTones[0]])
            await listening.waitUntilEntered()
            source.give(Array(boundaryTones.dropFirst()))
            await track.waitForPieces(3)
            #expect(track.pieces.all == boundaryTones)
            #expect(await mine.base.chunks.isEmpty)
            let stop = Task { try await rig.stop() }
            await track.waitUntilClosed()
            #expect(await mine.base.chunks.isEmpty)
            #expect(source.stops.all == [true])
            listening.release()
            try await stop.value
            #expect(await mine.base.chunks.map { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) } == boundaryTones)
            #expect(await mine.base.finishes == 1)
            #expect(track.closed.all == [true])
        }
    }

}

private actor HeldAudioRecognizer: Recognizer {
    let base = SessionRecognizer(name: "mine")
    let listening: DrainGate
    init(listening: DrainGate) { self.listening = listening }
    func hear(_ chunk: AudioChunk) async -> Hearing {
        await listening.wait()
        return await base.hear(chunk)
    }
    func finish() async -> Hearing { await base.finish() }
}
