import Synchronization

/// Gives one listener and one reader independent, ordered views of a capture.
public actor LiveAudio: Capture {

    private let capture: any Capture
    private let executor: (any TaskExecutor)?
    private let beforeInput: @Sendable () async -> Void
    private let position = Mutex(0.0)
    private let live = AsyncStream<Audio>.makeStream()
    private let output = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
    private var listened = false
    private var attempted = false
    private var started = false
    private var starting: Task<Void, any Error>?
    private var stopping: Task<Void, any Error>?
    private var receiving: Task<Void, Never>?

    /// Advances on arrival, before either consumer has accepted the piece.
    public nonisolated var capturedThrough: Double { position.withLock { $0 } }

    public init(capture: any Capture) {

        self.init(capture: capture, executor: nil)
    }

    init(
        capture: any Capture,
        beforeInput: @escaping @Sendable () async -> Void = {},
        executor: (any TaskExecutor)?
    ) {

        self.capture = capture
        self.beforeInput = beforeInput
        self.executor = executor
    }

    /// Only the first listener receives audio; it may subscribe before start.
    public func listen() -> AsyncStream<Audio> {

        guard !listened else { return AsyncStream { $0.finish() } }
        listened = true
        return live.stream
    }

    public func start() async throws -> AsyncThrowingStream<AudioPiece, any Error> {

        guard !attempted else { throw LifecycleError.alreadyStarted }
        attempted = true
        let task = Task(executorPreference: executor) { try await self.begin() }
        starting = task
        try await task.value
        return output.stream
    }

    /// Joins input even when stop fails, so both views contain every given piece.
    public func stop() async throws {

        if let stopping { return try await stopping.value }
        attempted = true
        let task = Task(executorPreference: executor) { try await self.end() }
        stopping = task
        try await task.value
    }

    private func begin() async throws {

        let stream: AsyncThrowingStream<AudioPiece, any Error>
        do { stream = try await capture.start() }
        catch {
            finish(error)
            throw error
        }
        started = true
        let beforeInput = beforeInput
        receiving = Task(executorPreference: executor) { [weak self] in
            await beforeInput()
            do {
                for try await piece in stream { await self?.receive(piece) }
                await self?.finish()
            } catch { await self?.finish(error) }
        }
    }

    private func receive(_ piece: AudioPiece) {

        let audio = position.withLock { position in
            let audio = Audio(start: position, samples: piece.samples, sampleRate: piece.sampleRate)
            position = audio.end
            return audio
        }
        // Separate unbounded buffers keep either consumer from holding the other.
        live.continuation.yield(audio)
        output.continuation.yield(piece)
    }

    private func finish(_ error: (any Error)? = nil) {

        live.continuation.finish()
        output.continuation.finish(throwing: error)
    }

    private func end() async throws {

        if let starting { _ = await starting.result }
        var failure: (any Error)?
        if started {
            do { try await capture.stop() }
            catch {
                failure = error
                // A failed stop quiesces production but can leave its stream open.
                // Cancellation drains buffered pieces before ending the read.
                receiving?.cancel()
            }
        }
        await receiving?.value
        finish()
        if let failure { throw failure }
    }

    deinit {

        receiving?.cancel()
        live.continuation.finish()
        output.continuation.finish()
    }
}

public enum LifecycleError: Error, Sendable, Equatable {

    case alreadyStarted
}
