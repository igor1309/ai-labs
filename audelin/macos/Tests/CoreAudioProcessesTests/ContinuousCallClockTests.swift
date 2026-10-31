@testable import CoreAudioProcesses
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ContinuousCallClockTests {

    @Test func firesOnceAfterRealDelay() async throws {

        let clock = ContinuousCallClock()
        let delay = Duration.milliseconds(20)
        let fired = AsyncStream<ContinuousClock.Instant>.makeStream()
        defer { fired.continuation.finish() }

        await confirmation(expectedCount: 1) { confirm in
            let origin = ContinuousClock.now
            let wait = clock.after(delay) {
                confirm()
                fired.continuation.yield(ContinuousClock.now)
            }
            defer { wait.cancel() }
            var instants = fired.stream.makeAsyncIterator()

            let instant = await instants.next()
            #expect(instant.map { origin.duration(to: $0) >= delay } == true)
        }
    }

    @Test func cancellingRealWaitDoesNotFire() async throws {

        let clock = ContinuousCallClock()
        let delay = Duration.milliseconds(20)
        let laterFired = AsyncStream<Void>.makeStream()
        defer { laterFired.continuation.finish() }

        // A wait cancelled before its deadline must never fire. If the test is
        // descheduled past the deadline before it cancels, the wait may fire
        // correctly, so that attempt proves nothing and is made again with a
        // counter of its own, until the suite's time limit cancels the test.
        var cancelledInTime: FireCount?
        while cancelledInTime == nil {
            try Task.checkCancellation()
            let fired = FireCount()
            let origin = ContinuousClock.now
            let wait = clock.after(delay) { fired.count.withLock { $0 += 1 } }
            wait.cancel()
            if origin.duration(to: .now) < delay { cancelledInTime = fired } else { await Task.yield() }
        }
        let fired = try #require(cancelledInTime)

        let laterWait = clock.after(.milliseconds(40)) { laterFired.continuation.yield(()) }
        defer { laterWait.cancel() }
        var laterFires = laterFired.stream.makeAsyncIterator()
        _ = await laterFires.next()

        #expect(fired.count.withLock { $0 } == 0)
    }

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

private final class FireCount: Sendable {
    let count = Mutex(0)
}
