public final class SystemClock: Sendable {
    private let readNow: @Sendable () -> ContinuousClock.Instant
    private let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void
    private let origin: ContinuousClock.Instant

    public convenience init() {
        let clock = ContinuousClock()
        self.init(now: { clock.now }, sleep: { try await clock.sleep(until: $0, tolerance: .zero) })
    }

    internal init(
        now: @escaping @Sendable () -> ContinuousClock.Instant,
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void
    ) {
        readNow = now
        self.sleep = sleep
        origin = now()
    }

    /// Seconds since this instance was constructed, from a monotonic clock.
    public func now() -> Double {
        seconds(at: readNow())
    }

    /// Remaining steps against a fixed deadline. The interval must be positive.
    public func countdown(from count: Int, every interval: Duration = .seconds(1)) -> AsyncStream<Int> {
        AsyncStream { continuation in
            guard count > 0 else {
                continuation.finish()
                return
            }
            precondition(interval > .zero, "The interval must be positive.")
            let deadline = readNow().advanced(by: interval * count)
            let timer = Task {
                defer { continuation.finish() }
                var remaining = count
                while remaining > 0 {
                    let next = deadline.advanced(by: interval * (1 - remaining))
                    do {
                        try await sleep(next)
                    } catch {
                        return
                    }
                    guard !Task.isCancelled else { return }
                    let left = readNow().duration(to: deadline)
                    // Read the deadline again after waking so a delayed tick
                    // skips expired steps rather than extending the countdown.
                    remaining = left > .zero
                        ? min(remaining - 1, Int((left / interval).rounded(.up)))
                        : 0
                    continuation.yield(remaining)
                }
            }
            continuation.onTermination = { _ in timer.cancel() }
        }
    }

    /// Instants from the same origin as `now()`. The interval must be positive.
    public func ticks(every interval: Duration) -> AsyncStream<Double> {
        precondition(interval > .zero, "The interval must be positive.")
        let start = readNow()
        return AsyncStream { continuation in
            let timer = Task {
                defer { continuation.finish() }
                var previous = start
                while !Task.isCancelled {
                    do {
                        try await sleep(previous.advanced(by: interval))
                    } catch {
                        return
                    }
                    guard !Task.isCancelled else { return }
                    previous = readNow()
                    continuation.yield(seconds(at: previous))
                }
            }
            continuation.onTermination = { _ in timer.cancel() }
        }
    }

    private func seconds(at instant: ContinuousClock.Instant) -> Double {
        let duration = origin.duration(to: instant).components
        return Double(duration.seconds) + Double(duration.attoseconds) / 1e18
    }
}
