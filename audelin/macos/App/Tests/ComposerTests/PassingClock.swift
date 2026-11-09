/// A clock whose every sleep ends at once and is kept, so a test can see how
/// long the app asked to wait without waiting.
final class PassingClock: Clock, Sendable {

    struct Instant: InstantProtocol {

        let offset: Duration

        func advanced(by duration: Duration) -> Instant { Instant(offset: offset + duration) }
        func duration(to other: Instant) -> Duration { other.offset - offset }
        static func < (left: Instant, right: Instant) -> Bool { left.offset < right.offset }
    }

    let asked = Values<Duration>()
    let slept = Signal()

    /// Time never passes, so each sleep's deadline is how long it asked for.
    var now: Instant { Instant(offset: .zero) }
    var minimumResolution: Duration { .nanoseconds(1) }

    func sleep(until deadline: Instant, tolerance: Duration?) async throws {

        asked.append(now.duration(to: deadline))
        slept.send()
    }
}
