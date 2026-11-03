import Composer
import Foundation
import Synchronization

/// An edge writer that records exactly what the session asks it to keep.
final class MemoryRecording: AudioRecording {
    let pieces = Values<CaptureBuffer>()
    let closed = Values<Bool>()
    let reads = Values<Range<Double>>()
    private let attempts = Mutex(0)
    private let written = Signal()
    private let closing = Signal()
    let firstWrite: DrainGate?
    let failingWrite: Int?
    let readSamples: [Float]

    init(firstWrite: DrainGate? = nil, failingWrite: Int? = nil, readSamples: [Float] = []) {
        self.firstWrite = firstWrite
        self.failingWrite = failingWrite
        self.readSamples = readSamples
    }

    func write(_ samples: [Float], sampleRate: Double) async throws {
        let attempt = attempts.withLock { $0 += 1; return $0 }
        if attempt == 1 { await firstWrite?.wait() }
        if attempt == failingWrite { throw AudioBoundaryFailure.write }
        pieces.append(.init(samples: samples, sampleRate: sampleRate))
        written.send()
    }

    func read(from start: Double, to end: Double) async throws -> [Float] {
        reads.append(start..<end)
        return Array(readSamples.dropFirst(Int((start * 48_000).rounded())).prefix(Int(((end - start) * 48_000).rounded())))
    }

    func close() async throws { closed.append(true); closing.send() }

    func waitUntilClosed() async {
        if closed.all.isEmpty { await closing.next() }
    }

    func waitForPieces(_ count: Int) async {
        while pieces.all.count < count { await written.next() }
    }
}

struct FixtureRecordings: RecordingStorage {
    let microphone: MemoryRecording
    let call: MemoryRecording
    func open(at url: URL) async throws -> any AudioRecording {
        url.lastPathComponent == "microphone.caf" ? microphone : call
    }
}

enum AudioBoundaryFailure: Error { case write, capture, stop }

/// No audio is produced until the test sends it or asks the source to stop.
final class BoundaryCapture: Sendable {
    let input = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
    let stops = Values<Bool>()
    let stopped = Signal()
    let stopFails: Bool
    let leavesOpen: Bool
    let final: [CaptureBuffer]

    init(stopFails: Bool = false, leavesOpen: Bool = false, final: [CaptureBuffer] = []) {
        self.stopFails = stopFails
        self.leavesOpen = leavesOpen
        self.final = final
    }

    func start() -> StartedCapture<CaptureBuffer> {
        StartedCapture(stream: input.stream, stop: {
            self.stops.append(true)
            self.give(self.final)
            if !self.leavesOpen { self.finish() }
            self.stopped.send()
            if self.stopFails { throw AudioBoundaryFailure.stop }
        })
    }

    func give(_ pieces: [CaptureBuffer]) {
        for piece in pieces { input.continuation.yield(piece) }
    }

    func finish(_ error: AudioBoundaryFailure? = nil) { input.continuation.finish(throwing: error) }
}

let boundaryTones: [CaptureBuffer] = [
    .init(samples: [0.1, -0.1], sampleRate: 8_000),
    .init(samples: [0.2, 0, -0.2], sampleRate: 16_000),
    .init(samples: [0.3, 0.1, -0.3, -0.1], sampleRate: 48_000),
]
