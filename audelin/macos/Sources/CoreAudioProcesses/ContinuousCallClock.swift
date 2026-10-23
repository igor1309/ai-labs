/// Counts the call's silence with the system's monotonic clock.
public struct ContinuousCallClock: CallClock {

    private let now: @Sendable () -> ContinuousClock.Instant
    private let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void
    private let finished: @Sendable () -> Void

    public init() {

        self.init(
            now: { ContinuousClock.now },
            sleep: { try await Task.sleep(until: $0, clock: .continuous) },
            finished: {}
        )
    }

    init(
        now: @escaping @Sendable () -> ContinuousClock.Instant,
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void,
        finished: @escaping @Sendable () -> Void
    ) {

        self.now = now
        self.sleep = sleep
        self.finished = finished
    }

    public func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        let deadline = now().advanced(by: delay)
        let task = Task {
            defer { finished() }
            do {
                try await sleep(deadline)
                fire()
            } catch {}
        }
        return Cancellation { task.cancel() }
    }
}
