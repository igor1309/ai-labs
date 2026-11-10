import Synchronization

/// Saves only the latest waiting value, with a pause after every attempt.
public final class SavePacing<Value: Sendable>: Sendable {

    private let pending: AsyncStream<Value>.Continuation
    private let worker: Task<Void, Never>
    private let rest: Rest

    public init(
        saving: any Saving<Value>, failureReport: any FailureReport,
        pause: @escaping @Sendable () async throws -> Void
    ) {

        let pending = AsyncStream<Value>.makeStream(bufferingPolicy: .bufferingNewest(1))
        self.pending = pending.continuation
        let rest = Rest()
        self.rest = rest
        worker = Task {
            var failing = false
            for await value in pending.stream {
                do {
                    try await saving.save(value)
                    failing = false
                } catch {
                    if !failing { await failureReport.saveFailed(error) }
                    failing = true
                }
                let resting = rest.start { _ = try? await pause() }
                await withTaskCancellationHandler { await resting?.value } onCancel: { resting?.cancel() }
            }
        }
    }

    public func submit(_ value: Value) {

        pending.yield(value)
    }

    public func finish() async {

        // End the pause before draining, including pauses a save might start as it returns.
        rest.end()
        pending.finish()
        await worker.value
    }

    deinit {

        pending.finish()
        rest.end()
        worker.cancel()
    }

    /// The pause in progress, which ending cancels and no later pause follows.
    private final class Rest: Sendable {

        private let state = Mutex<(ended: Bool, task: Task<Void, Never>?)>((false, nil))

        func start(_ pause: @escaping @Sendable () async -> Void) -> Task<Void, Never>? {

            state.withLock { state in
                guard !state.ended else { return nil }
                let task = Task { await pause() }
                state.task = task
                return task
            }
        }

        func end() {

            state.withLock { state in
                state.ended = true
                state.task?.cancel()
            }
        }
    }
}
