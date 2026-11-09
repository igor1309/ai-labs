import Composer
import Synchronization
import Testing
@testable import Audelin

enum CaptureKind: CaseIterable, Sendable { case microphone, callAudio }

@Suite(.timeLimit(.minutes(1)))
struct ProductionCaptureTests {

    private func start(_ kind: CaptureKind, _ capture: FakeCapture) async throws -> StartedCapture<CaptureBuffer> {
        switch kind {
        case .microphone: try await startProductionMicrophone(makeCapture: { capture })
        case .callAudio: try await startProductionCallAudio(.only([1]), makeCapture: { _ in capture })
        }
    }

    @Test(arguments: CaptureKind.allCases)
    func piecesReachTheConsumerAsBuffersUntilTheSourceEnds(kind: CaptureKind) async throws {
        let capture = FakeCapture()
        let started = try await start(kind, capture)
        capture.source.yield(FakePiece(samples: [0.25, -0.5], sampleRate: 16_000))
        capture.source.finish()

        var buffers: [CaptureBuffer] = []
        for try await buffer in started.stream { buffers.append(buffer) }

        #expect(buffers == [CaptureBuffer(samples: [0.25, -0.5], sampleRate: 16_000)])
    }

    @Test(arguments: CaptureKind.allCases)
    func anErrorFromTheCaptureReachesTheConsumer(kind: CaptureKind) async throws {
        let capture = FakeCapture()
        let started = try await start(kind, capture)
        capture.source.finish(throwing: CaptureFailure())

        await #expect(throws: CaptureFailure.self) {
            for try await _ in started.stream {}
        }
    }

    @Test(arguments: CaptureKind.allCases)
    func endingTheStreamStopsTheCaptureAndCancelsTheSource(kind: CaptureKind) async throws {
        let capture = FakeCapture()
        let started = try await start(kind, capture)
        let stream = started.stream
        let consumer = Task { for try await _ in stream {} }
        #expect(capture.stops == 0)

        consumer.cancel()

        await capture.sourceCancelled()
        #expect(capture.stops == 1)
    }

    @Test(arguments: CaptureKind.allCases)
    func stopStopsTheCapture(kind: CaptureKind) async throws {
        let capture = FakeCapture()
        let started = try await start(kind, capture)

        try await started.stop()

        #expect(capture.stops == 1)
    }

    @Test func callAudioStartsWithTheSelection() async throws {
        let selection = CaptureSelection.allExcept([7, 8])
        let seen = Mutex<CaptureSelection?>(nil)

        _ = try await startProductionCallAudio(selection) { selection in
            seen.withLock { $0 = selection }
            return FakeCapture()
        }

        #expect(seen.withLock { $0 } == selection)
    }
}

private struct CaptureFailure: Error {}

private struct FakePiece: CapturePiece {
    let samples: [Float]
    let sampleRate: Double
}

private final class FakeCapture: AudioCapture {
    let audio: AsyncThrowingStream<FakePiece, any Error>
    let source: AsyncThrowingStream<FakePiece, any Error>.Continuation
    private let cancellations = AsyncStream<Void>.makeStream()
    private let stopCount = Mutex(0)

    init() {
        (audio, source) = AsyncThrowingStream<FakePiece, any Error>.makeStream()
        source.onTermination = { [cancellations] termination in
            if case .cancelled = termination { cancellations.continuation.yield() }
        }
    }

    var stops: Int { stopCount.withLock { $0 } }
    func stop() { stopCount.withLock { $0 += 1 } }

    func sourceCancelled() async {
        var iterator = cancellations.stream.makeAsyncIterator()
        _ = await iterator.next()
    }
}
