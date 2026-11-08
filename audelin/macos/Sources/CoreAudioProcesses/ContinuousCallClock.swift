/// Counts the call's silence with the system's monotonic clock.
public struct ContinuousCallClock: CallClock {

    private let now: @Sendable () -> ContinuousClock.Instant
    private let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void

    /// Reads `now` and waits with `sleep`: `ContinuousClock.now` and
    /// `Task.sleep(until:clock: .continuous)` in the app.
    public init(
        now: @escaping @Sendable () -> ContinuousClock.Instant,
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void
    ) {

        self.now = now
        self.sleep = sleep
    }

    public func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        let deadline = now().advanced(by: delay)
        let task = Task {
            do {
                try await sleep(deadline)
                fire()
            } catch {}
        }
        return Cancellation { task.cancel() }
    }
}
