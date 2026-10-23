@testable import CoreAudioProcesses
import Synchronization
import Testing

struct ContinuousCallClockTests {

    @Test(arguments: [Duration.zero, .seconds(30), .seconds(90)])
    func forwardsTheDeadlineAndFiresAfterSleep(delay: Duration) async throws {

        let sleep = ControlledCallSleep()
        let origin = ContinuousClock.now
        let completed = AsyncStream<Void>.makeStream()
        let fired = Mutex(0)
        let clock = ContinuousCallClock(now: { origin }, sleep: { try await sleep.until($0) }, finished: { completed.continuation.yield(()) })
        let wait = clock.after(delay) { fired.withLock { $0 += 1 } }
        defer { wait.cancel() }
        var deadlines = sleep.deadlines.makeAsyncIterator()

        #expect(await deadlines.next() == origin.advanced(by: delay))
        #expect(fired.withLock { $0 } == 0)
        sleep.resume()
        var finishes = completed.stream.makeAsyncIterator()
        _ = await finishes.next()
        #expect(fired.withLock { $0 } == 1)
    }

    @Test func cancellingTheWaitCancelsSleepAndDoesNotFire() async throws {

        let sleep = ControlledCallSleep()
        let origin = ContinuousClock.now
        let completed = AsyncStream<Void>.makeStream()
        let fired = Mutex(0)
        let clock = ContinuousCallClock(now: { origin }, sleep: { try await sleep.until($0) }, finished: { completed.continuation.yield(()) })
        let wait = clock.after(.seconds(30)) { fired.withLock { $0 += 1 } }
        var deadlines = sleep.deadlines.makeAsyncIterator()
        #expect(await deadlines.next() == origin.advanced(by: .seconds(30)))

        wait.cancel()
        sleep.resume()
        var finishes = completed.stream.makeAsyncIterator()
        _ = await finishes.next()

        #expect(sleep.wasCancelled)
        #expect(fired.withLock { $0 } == 0)
    }
}

/// The sleep returns only when released, reporting cancellation on return.
private final class ControlledCallSleep: Sendable {

    private struct State {

        var continuation: CheckedContinuation<Void, Never>?
        var cancelled = false
    }

    private let state = Mutex(State())
    let deadlines: AsyncStream<ContinuousClock.Instant>
    private let started: AsyncStream<ContinuousClock.Instant>.Continuation

    init() {

        (deadlines, started) = AsyncStream.makeStream()
    }

    var wasCancelled: Bool {

        state.withLock { $0.cancelled }
    }

    func until(_ deadline: ContinuousClock.Instant) async throws {

        await withCheckedContinuation { continuation in
            state.withLock { $0.continuation = continuation }
            started.yield(deadline)
        }
        state.withLock { $0.cancelled = Task.isCancelled }
        try Task.checkCancellation()
    }

    func resume() {

        let continuation = state.withLock {
            let continuation = $0.continuation
            $0.continuation = nil
            return continuation
        }
        continuation?.resume()
    }
}
