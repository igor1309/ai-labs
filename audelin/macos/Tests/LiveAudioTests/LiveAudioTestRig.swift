import Synchronization
@testable import LiveAudio

// A held consumer ends only when its test releases it, including after cancellation.
final class AudioGate: Sendable {

    private struct State {
        var entered = false
        var released = false
        var waiting: CheckedContinuation<Void, Never>?
    }

    private let state = Mutex(State())
    private let arrival = AsyncStream<Void>.makeStream()

    var isHeld: Bool { state.withLock { $0.entered && !$0.released } }

    func wait() async {

        await withCheckedContinuation { continuation in
            let release = state.withLock { state in
                state.entered = true
                if state.released { return true }
                state.waiting = continuation
                return false
            }
            arrival.continuation.yield(())
            if release { continuation.resume() }
        }
    }

    func waitUntilEntered() async {

        var iterator = arrival.stream.makeAsyncIterator()
        _ = await iterator.next()
    }

    func release() {

        let waiting = state.withLock { state in
            state.released = true
            let waiting = state.waiting
            state.waiting = nil
            return waiting
        }
        waiting?.resume()
    }
}

enum Refusal: Error, Equatable {
    case start, stop, capture
}

final class FakeCapture: Capture, Sendable {

    private let input = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
    private let stopCount = Mutex(0)
    let startFailure: Refusal?
    let stopFailure: Refusal?
    let stopEndsInput: Bool

    init(startFailure: Refusal? = nil, stopFailure: Refusal? = nil, stopEndsInput: Bool = true) {

        self.startFailure = startFailure
        self.stopFailure = stopFailure
        self.stopEndsInput = stopEndsInput
    }

    var stops: Int { stopCount.withLock { $0 } }

    func start() async throws -> AsyncThrowingStream<AudioPiece, any Error> {

        if let startFailure { throw startFailure }
        return input.stream
    }

    func stop() async throws {

        stopCount.withLock { $0 += 1 }
        if stopEndsInput { finish() }
        if let stopFailure { throw stopFailure }
    }

    func give(_ pieces: [AudioPiece]) {

        for piece in pieces { input.continuation.yield(piece) }
    }

    func finish(_ error: Refusal? = nil) {

        input.continuation.finish(throwing: error)
    }
}

func tones() -> [AudioPiece] {

    [
        AudioPiece(samples: [0.1, -0.1], sampleRate: 8_000),
        AudioPiece(samples: [0.2, 0, -0.2], sampleRate: 16_000),
        AudioPiece(samples: [0.3, 0.1, -0.3, -0.1], sampleRate: 48_000),
    ]
}

func heard(_ stream: AsyncStream<Audio>) async -> [Audio] {

    var result: [Audio] = []
    for await audio in stream { result.append(audio) }
    return result
}

func pieces(_ audio: [Audio]) -> [AudioPiece] {

    audio.map { AudioPiece(samples: $0.samples, sampleRate: $0.sampleRate) }
}

func read(_ stream: AsyncThrowingStream<AudioPiece, any Error>) async throws -> [AudioPiece] {

    var result: [AudioPiece] = []
    for try await piece in stream { result.append(piece) }
    return result
}

/// Drives runnable work before inspecting whether held input blocks stop.
final class CaptureExecutor: TaskExecutor {

    private let jobs = Mutex<[UnownedJob]>([])
    private let events = AsyncStream<Void>.makeStream()
    private let completed = Mutex(false)

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        jobs.withLock { $0.append(job) }
        events.continuation.yield(())
    }

    func complete() {

        completed.withLock { $0 = true }
        events.continuation.finish()
    }

    func run(until condition: () -> Bool) async {

        var iterator = events.stream.makeAsyncIterator()
        while !condition() && !completed.withLock({ $0 }) {
            run()
            if !condition() { _ = await iterator.next() }
        }
        run()
    }

    func finish() async {

        for await _ in events.stream { run() }
        run()
    }

    func run() {

        while let job = jobs.withLock({ $0.isEmpty ? nil : $0.removeFirst() }) {
            job.runSynchronously(on: asUnownedTaskExecutor())
        }
    }
}
