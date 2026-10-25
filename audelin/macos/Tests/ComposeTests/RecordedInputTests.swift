import protocol LiveAudio.Capture
import Synchronization
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct RecordedInputTests {

    @Test(arguments: [false, true])
    func failedStopJoinsPendingForwarding(endsInput: Bool) async throws {

        let failure = StopRefusal()
        let source = FailingCapture(failure: failure, endsInput: endsInput)
        let forwarding = DrainGate(), executor = DrainExecutor(), returned = Mutex(false)
        let tones: [CapturedPiece] = [
            .init(samples: [0.1, -0.1], sampleRate: 8_000),
            .init(samples: [0.2, 0, -0.2], sampleRate: 16_000),
            .init(samples: [0.3, 0.1, -0.3, -0.1], sampleRate: 48_000),
        ]
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            let input = RecordedInput(
                capture: source, beforeInput: { await forwarding.wait() }, executor: executor
            )
            let stream = try await input.start()
            source.give(tones)
            do {
                try await input.stop()
                Issue.record("Expected the original stop failure")
            } catch {
                #expect(error as? StopRefusal === failure)
            }
            returned.withLock { $0 = true }
            var heard: [CapturedPiece] = []
            for try await piece in stream {
                heard.append(.init(samples: piece.samples, sampleRate: piece.sampleRate))
            }
            #expect(heard == tones)
        }
        defer { forwarding.release(); source.finish(); executor.run() }
        await executor.run(until: { forwarding.entered && source.stops == 1 })
        #expect(forwarding.entered)
        #expect(source.stops == 1)
        #expect(!returned.withLock { $0 })
        forwarding.release()
        await executor.finish()
        try await task.value
        #expect(returned.withLock { $0 })
    }
}

private final class StopRefusal: Error {}

private final class FailingCapture: Capture, Sendable {

    private let input = AsyncThrowingStream<CapturedPiece, any Error>.makeStream()
    private let stopCount = Mutex(0)
    private let failure: StopRefusal
    private let endsInput: Bool

    init(failure: StopRefusal, endsInput: Bool) {

        self.failure = failure
        self.endsInput = endsInput
    }

    var stops: Int { stopCount.withLock { $0 } }

    func start() async throws -> AsyncThrowingStream<CapturedPiece, any Error> { input.stream }

    func stop() async throws {

        stopCount.withLock { $0 += 1 }
        if endsInput { finish() }
        throw failure
    }

    func give(_ pieces: [CapturedPiece]) {

        for piece in pieces { input.continuation.yield(piece) }
    }

    func finish() { input.continuation.finish() }
}
