import Composer
import CoreAudioProcesses
import Synchronization
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct RealTimeTests {

    @Test func ticksOncePerSecondOnAFixedSchedule() async throws {
        let sleep = SleepSpy()
        let start = ContinuousClock.now
        let time = realTime(sleepUntil: sleep.until)
        var ticks = time.ticks().makeAsyncIterator()
        var events = sleep.events.makeAsyncIterator()

        let first = try #require(await events.next()?.deadline)
        #expect(first >= start + .seconds(1))
        sleep.release()
        #expect(await ticks.next() != nil)

        let second = try #require(await events.next()?.deadline)
        #expect(first.duration(to: second) == .seconds(1))
        sleep.release()
        #expect(await ticks.next() != nil)
    }

    @Test func ticksStopSleepingOnTermination() async throws {
        let sleep = SleepSpy()
        let stream = realTime(sleepUntil: sleep.until).ticks()
        let consumer = Task { for await _ in stream {} }
        var events = sleep.events.makeAsyncIterator()
        #expect(await events.next()?.deadline != nil)

        consumer.cancel()
        await consumer.value

        #expect(await events.next() == .cancelled)
    }

    @Test func theRealClockTicks() async {
        let start = ContinuousClock.now
        var ticks = realTime().ticks().makeAsyncIterator()

        #expect(await ticks.next() != nil)
        #expect(start.duration(to: .now) >= .seconds(1))
    }

    @Test func afterFiresOnTheRealClock() async {
        let time = realTime()
        await withCheckedContinuation { (fired: CheckedContinuation<Void, Never>) in
            _ = time.after(.milliseconds(1)) { fired.resume() }
        }
    }

    @Test func afterPassesTheDelayAndCallbackToTheCallClock() {
        let clock = CallClockSpy()
        let fires = Mutex(0)

        _ = realTime(callClock: clock).after(.seconds(5)) { fires.withLock { $0 += 1 } }

        #expect(clock.delays == [.seconds(5)])
        #expect(fires.withLock { $0 } == 0)
        clock.fire()
        #expect(fires.withLock { $0 } == 1)
    }

    @Test func cancellingAfterCancelsTheTimer() {
        let clock = CallClockSpy()

        let cancellation = realTime(callClock: clock).after(.seconds(5)) {}
        #expect(clock.cancels == 0)
        cancellation.cancel()

        #expect(clock.cancels == 1)
    }
}

private final class SleepSpy: Sendable {
    enum Event: Equatable {
        case sleeping(ContinuousClock.Instant), cancelled
        var deadline: ContinuousClock.Instant? {
            if case let .sleeping(deadline) = self { deadline } else { nil }
        }
    }

    private let eventStream = AsyncStream<Event>.makeStream()
    private let gate = AsyncStream<Void>.makeStream()

    var events: AsyncStream<Event> { eventStream.stream }

    func release() { gate.continuation.yield() }

    func until(_ deadline: ContinuousClock.Instant) async throws {
        eventStream.continuation.yield(.sleeping(deadline))
        var released = gate.stream.makeAsyncIterator()
        if await released.next() == nil || Task.isCancelled {
            eventStream.continuation.yield(.cancelled)
            throw CancellationError()
        }
    }
}

private final class CallClockSpy: CallClock {
    private struct Calls {
        var delays: [Duration] = []
        var fire: (@Sendable () -> Void)?
        var cancels = 0
    }
    private let calls = Mutex(Calls())

    var delays: [Duration] { calls.withLock { $0.delays } }
    var cancels: Int { calls.withLock { $0.cancels } }
    func fire() { calls.withLock { $0.fire }?() }

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {
        calls.withLock {
            $0.delays.append(delay)
            $0.fire = fire
        }
        return Cancellation { self.calls.withLock { $0.cancels += 1 } }
    }
}
