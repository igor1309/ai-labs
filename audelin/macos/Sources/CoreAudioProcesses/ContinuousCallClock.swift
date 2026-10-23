/// Counts the call's silence with the system's monotonic clock.
public struct ContinuousCallClock: CallClock {

    public init() {}

    public func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        let deadline = ContinuousClock.now.advanced(by: delay)
        let task = Task {
            do {
                try await Task.sleep(until: deadline, clock: .continuous)
                fire()
            } catch {}
        }
        return Cancellation { task.cancel() }
    }
}
