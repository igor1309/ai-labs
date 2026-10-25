/// Records one capture while delivering its audio independently to one listener.
public actor RecordedCapture {

    /// Failures are buffered from construction and remain available until stop.
    /// The stream ends after stop has joined all work, or a refused start.
    public nonisolated let failures: AsyncStream<Failure>

    private let capture: any Capture
    private let track: any Track
    private let executor: (any TaskExecutor)?
    private let beforeInput: @Sendable () async -> Void
    private let news: AsyncStream<Failure>.Continuation
    private let live = AsyncStream<Audio>.makeStream()
    private let pending = AsyncStream<AudioPiece>.makeStream()
    private var listened = false
    private var attempted = false
    private var started = false
    private var trackFailed = false
    private var position = 0.0
    private var firstFailure: Failure?
    private var starting: Task<Void, any Error>?
    private var stopping: Task<Void, any Error>?
    private var captureStop: Task<Void, any Error>?
    private var receiving: Task<Void, Never>?
    private var writing: Task<Void, Never>?

    public init(capture: any Capture, track: any Track) {

        self.init(capture: capture, track: track, executor: nil)
    }

    init(
        capture: any Capture,
        track: any Track,
        beforeInput: @escaping @Sendable () async -> Void = {},
        executor: (any TaskExecutor)?
    ) {

        self.capture = capture
        self.track = track
        self.executor = executor
        self.beforeInput = beforeInput
        let events = AsyncStream<Failure>.makeStream()
        failures = events.stream
        news = events.continuation
    }

    /// Starts once. A refused start ends a listener that subscribed beforehand.
    public func start() async throws {

        guard !attempted else { throw LifecycleError.alreadyStarted }
        attempted = true
        let task = Task(executorPreference: executor) { try await self.begin() }
        starting = task
        try await task.value
    }

    /// Stops production and joins all writes, including after a failed stop.
    /// Concurrent and repeated stops join the same work and return its result.
    public func stop() async throws {

        if let stopping { return try await stopping.value }
        attempted = true
        let task = Task(executorPreference: executor) { try await self.end() }
        stopping = task
        try await task.value
    }

    /// Only the first call receives audio. Later calls receive an ended stream.
    public func listen() -> AsyncStream<Audio> {

        guard !listened else { return AsyncStream { $0.finish() } }
        listened = true
        return live.stream
    }

    private func begin() async throws {

        let stream: AsyncThrowingStream<AudioPiece, any Error>
        do {
            stream = try await capture.start()
        } catch {
            let failure = Failure.capture(error)
            report(failure)
            finishInput()
            news.finish()
            throw failure
        }
        started = true
        let track = track, pending = pending.stream
        // These unbounded streams keep capture delivery independent of disk speed.
        writing = Task(executorPreference: executor) { [weak self] in
            do {
                for await piece in pending {
                    try await track.write(piece.samples, sampleRate: piece.sampleRate)
                }
            } catch {
                await self?.failedWrite(error)
            }
        }
        let beforeInput = beforeInput
        receiving = Task(executorPreference: executor) { [weak self] in
            await beforeInput()
            do {
                for try await piece in stream {
                    guard await self?.receive(piece) == true else { break }
                }
            } catch {
                await self?.failedCapture(error)
            }
            await self?.finishInput()
        }
    }

    private func receive(_ piece: AudioPiece) -> Bool {

        guard !trackFailed else { return false }
        let audio = Audio(start: position, samples: piece.samples, sampleRate: piece.sampleRate)
        position = audio.end
        live.continuation.yield(audio)
        pending.continuation.yield(piece)
        return true
    }

    private func failedCapture(_ error: any Error) {

        guard !trackFailed else { return }
        report(.capture(error))
    }

    private func failedWrite(_ error: any Error) async {

        trackFailed = true
        report(.track(error))
        finishInput()
        receiving?.cancel()
        _ = try? await stopCapture()
    }

    private func finishInput() {

        live.continuation.finish()
        pending.continuation.finish()
    }

    private func report(_ failure: Failure) {

        if firstFailure == nil { firstFailure = failure }
        news.yield(failure)
    }

    private func stopCapture(requested: Bool = false) async throws {

        if let captureStop { return try await captureStop.value }
        let capture = capture
        let task = Task(executorPreference: executor) { [weak self] in
            do {
                try await capture.stop()
            } catch {
                let failure: Failure = requested ? .stop(error) : .capture(error)
                await self?.failedStop(failure)
                throw failure
            }
        }
        captureStop = task
        try await task.value
    }

    private func failedStop(_ failure: Failure) {

        report(failure)
        // Production has quiesced. Cancellation ends an open read while the
        // stream still drains pieces already buffered before the failed stop.
        receiving?.cancel()
    }

    private func end() async throws {

        if let starting { _ = await starting.result }
        if started { _ = try? await stopCapture(requested: true) }
        await receiving?.value
        await writing?.value
        finishInput()
        news.finish()
        if let firstFailure { throw firstFailure }
    }

    deinit {

        receiving?.cancel()
        writing?.cancel()
        live.continuation.finish()
        pending.continuation.finish()
        news.finish()
    }
}

public enum LifecycleError: Error, Sendable, Equatable {

    case alreadyStarted
}
