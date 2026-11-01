import class LiveAudio.LiveAudio
import class RecordedCapture.RecordedCapture
import enum RecordedCapture.Failure
import Synchronization
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct RecordedLiveAudioTests {

    @Test(arguments: [1, 2])
    func failedWriteStillDeliversItsAudio(failingWrite: Int) async throws {

        let source = CaptureSource(), track = MemoryTrack(failingWrite: failingWrite)
        defer { source.finish() }
        let live = LiveAudio(capture: source.adapter())
        let recorded = RecordedCapture(capture: RecordedInput(capture: live), track: track)
        let listener = await live.listen()
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        let given = Array(numberedTones.prefix(failingWrite))
        source.give(given)
        guard case .track(let cause) = try #require(await failures.next()) else {
            Issue.record("Expected a track failure"); return
        }
        #expect(cause as? CaptureRefusal == .write)
        var heard: [CapturedPiece] = []
        for await audio in listener { heard.append(.init(samples: audio.samples, sampleRate: audio.sampleRate)) }
        #expect(heard == given)
        #expect(track.pieces == Array(given.dropLast()))
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(source.stops.withLock { $0 } == 1)
    }

    @Test func liveAudioAndItsTimePassAHeldWrite() async throws {

        let source = CaptureSource(), track = MemoryTrack(holdFirst: true)
        defer { source.finish(); track.release.end() }
        let live = LiveAudio(capture: source.adapter())
        let recorded = RecordedCapture(capture: RecordedInput(capture: live), track: track)
        var listener = await live.listen().makeAsyncIterator()
        try await recorded.start()
        source.give(numberedTones)
        await track.entered.next()
        let first = try #require(await listener.next()), second = try #require(await listener.next())
        #expect(first.samples == numberedTones[0].samples)
        #expect(second.samples == numberedTones[1].samples)
        #expect(first.start == 0)
        #expect(second.start == Double(first.samples.count) / first.sampleRate)
        #expect(track.pieces.isEmpty)
        track.release.end()
        try await recorded.stop()
        let third = try #require(await listener.next())
        #expect(third.start == second.end)
        #expect(third.samples == numberedTones[2].samples)
        #expect(await listener.next() == nil)
        #expect(track.pieces == numberedTones)
        #expect(live.capturedThrough == third.end)
    }

    @Test func captureFailureReachesRecordingAfterEveryTone() async throws {

        let source = CaptureSource(), track = MemoryTrack()
        let live = LiveAudio(capture: source.adapter())
        let recorded = RecordedCapture(capture: RecordedInput(capture: live), track: track)
        let listener = await live.listen()
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        source.give(numberedTones)
        source.finish(.capture)
        guard case .capture(let cause) = try #require(await failures.next()) else {
            Issue.record("Expected a capture failure"); return
        }
        #expect(cause as? CaptureRefusal == .capture)
        var heard: [CapturedPiece] = []
        for await audio in listener { heard.append(.init(samples: audio.samples, sampleRate: audio.sampleRate)) }
        #expect(heard == numberedTones)
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(track.pieces == numberedTones)
    }

    @Test(arguments: [false, true])
    func failedStopKeepsEveryToneAndReportsOnlyStop(leavesOpen: Bool) async throws {

        let source = CaptureSource(stopFails: true, leavesOpen: leavesOpen), track = MemoryTrack()
        defer { source.finish() }
        let live = LiveAudio(capture: source.adapter())
        let recorded = RecordedCapture(capture: RecordedInput(capture: live), track: track)
        let listener = await live.listen()
        try await recorded.start()
        source.give(numberedTones)
        await #expect(throws: Failure.self) { try await recorded.stop() }
        var failures = recorded.failures.makeAsyncIterator()
        guard case .stop(let cause) = try #require(await failures.next()) else {
            Issue.record("Expected a stop failure"); return
        }
        #expect(cause as? CaptureRefusal == .stop)
        #expect(await failures.next() == nil)
        var heard: [CapturedPiece] = []
        for await audio in listener { heard.append(.init(samples: audio.samples, sampleRate: audio.sampleRate)) }
        #expect(heard == numberedTones)
        #expect(track.pieces == numberedTones)
        #expect(source.stops.withLock { $0 } == 1)
    }
}

private enum CaptureRefusal: Error { case write, capture, stop }

private let numberedTones: [CapturedPiece] = [
    .init(samples: [0.1, -0.1], sampleRate: 8_000),
    .init(samples: [0.2, 0, -0.2], sampleRate: 16_000),
    .init(samples: [0.3, 0.1, -0.3, -0.1], sampleRate: 48_000),
]

private final class CaptureSource: Sendable {

    let input = AsyncThrowingStream<CapturedPiece, any Error>.makeStream()
    let stops = Mutex(0)
    let stopFails: Bool
    let leavesOpen: Bool

    init(stopFails: Bool = false, leavesOpen: Bool = false) {

        self.stopFails = stopFails
        self.leavesOpen = leavesOpen
    }

    func adapter() -> CaptureAdapter<CapturedPiece> {

        CaptureAdapter(begin: {
            StartedCapture(stream: self.input.stream, stop: {
                self.stops.withLock { $0 += 1 }
                if !self.leavesOpen { self.finish() }
                if self.stopFails { throw CaptureRefusal.stop }
            })
        }, unpack: { $0 })
    }

    func give(_ pieces: [CapturedPiece]) {

        for piece in pieces { input.continuation.yield(piece) }
    }

    func finish(_ error: CaptureRefusal? = nil) { input.continuation.finish(throwing: error) }
}

private final class MemoryTrack: RecordingTrack, Sendable {

    private let stored = Mutex<[CapturedPiece]>([])
    private let attempts = Mutex(0)
    let failingWrite: Int?
    let holdFirst: Bool
    let entered = Signal(), release = Signal()

    init(failingWrite: Int? = nil, holdFirst: Bool = false) {

        self.failingWrite = failingWrite
        self.holdFirst = holdFirst
    }

    var pieces: [CapturedPiece] { stored.withLock { $0 } }

    func write(_ samples: [Float], sampleRate: Double) async throws {

        let attempt = attempts.withLock { $0 += 1; return $0 }
        if attempt == 1 && holdFirst { entered.send(); await release.next() }
        if attempt == failingWrite { throw CaptureRefusal.write }
        stored.withLock { $0.append(.init(samples: samples, sampleRate: sampleRate)) }
    }
}
