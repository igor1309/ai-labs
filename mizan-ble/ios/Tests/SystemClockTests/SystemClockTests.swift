@testable import SystemClock
import Testing

struct SystemClockTests {
    @Test func nowKeepsItsConstructionOrigin() async throws {
        let older = SystemClock()
        try await Task.sleep(for: .milliseconds(50))
        let newer = SystemClock()

        let newerReading = newer.now()
        let olderReading = older.now()

        #expect(olderReading - newerReading >= 0.05)
    }

    @Test func nowAdvancesMonotonically() async throws {
        let clock = SystemClock()
        let first = clock.now()

        try await Task.sleep(for: .seconds(1))

        var previous = clock.now()
        #expect(first >= 0)
        #expect(previous - first >= 1)
        for _ in 0..<100 {
            let next = clock.now()
            #expect(next >= previous)
            previous = next
        }
    }

    @Test func countdownRunsOut() async {
        let clock = SystemClock()
        let started = ContinuousClock.now
        var values: [Int] = []

        for await value in clock.countdown(from: 3, every: .milliseconds(250)) {
            values.append(value)
        }

        #expect(values == [2, 1, 0])
        #expect(started.duration(to: .now) >= .milliseconds(750))
    }

    @Test func countdownStopsWhenReaderIsCancelled() async {
        let clock = SystemClock()
        let stream = clock.countdown(from: 3, every: .milliseconds(250))
        let reader = Task {
            var values: [Int] = []
            for await value in stream {
                values.append(value)
                withUnsafeCurrentTask { $0?.cancel() }
            }
            return values
        }

        #expect(await reader.value == [2])
    }

    @Test(arguments: [0, -1, Int.min])
    func nonpositiveCountdownFinishesWithoutValues(count: Int) async {
        let clock = SystemClock()
        var values: [Int] = []

        for await value in clock.countdown(from: count) {
            values.append(value)
        }

        #expect(values == [])
    }

    @Test func ticksCarrySpacedInstantsAndStopWhenReaderIsCancelled() async throws {
        let clock = SystemClock()
        let first = clock.now()
        let stream = clock.ticks(every: .milliseconds(250))
        let reader = Task {
            var values: [Double] = []
            for await value in stream {
                values.append(value)
                if values.count == 3 {
                    withUnsafeCurrentTask { $0?.cancel() }
                }
            }
            return values
        }

        let values = await reader.value
        #expect(values.count == 3)
        let firstTick = try #require(values.first)
        #expect(firstTick - first >= 0.25)
        for (previous, next) in zip(values, values.dropFirst()) {
            #expect(next - previous >= 0.25)
        }
        #expect(clock.now() >= values.last!)
    }

    @Test(arguments: WakeCase.allCases)
    func countdownUsesItsDeadlineAfterEveryKindOfWake(wake: WakeCase) async {
        let binding = ManualClock()
        let clock = SystemClock(now: { binding.now }, sleep: { try await binding.sleep(until: $0) })
        // The countdown starts after the instance's origin, with a non-unit interval.
        await binding.start(at: .seconds(10))
        let start = binding.now
        let (acknowledgements, acknowledged) = AsyncStream<Void>.makeStream()
        let driver = Task {
            var requests: [Duration] = []
            var acknowledgements = acknowledgements.makeAsyncIterator()
            for await deadline in binding.requests {
                requests.append(start.duration(to: deadline))
                guard requests.count <= wake.times.count else {
                    await binding.cancelSleep()
                    break
                }
                await binding.advance(to: start.advanced(by: wake.times[requests.count - 1]))
                guard await acknowledgements.next() != nil else { break }
            }
            return requests
        }
        var values: [Int] = []
        var deliveredAt: [Duration] = []
        for await value in clock.countdown(from: 4, every: .seconds(2)) {
            values.append(value)
            deliveredAt.append(start.duration(to: binding.now))
            acknowledged.yield(())
        }
        binding.requestsContinuation.finish()
        acknowledged.finish()
        let requests = await driver.value

        #expect(values == wake.values)
        #expect(deliveredAt == wake.times)
        #expect(requests == wake.deadlines)
        // A wake beyond the deadline reports zero immediately upon waking.
        #expect(deliveredAt.last == max(.seconds(8), wake.times.last!))
        #expect(await binding.pendingSleeps == 0)
    }

    @Test(arguments: StreamKind.allCases)
    func endingReadingCancelsThePendingBindingSleep(kind: StreamKind) async {
        let binding = ManualClock()
        let clock = SystemClock(now: { binding.now }, sleep: { try await binding.sleep(until: $0) })
        let countdown = kind == .countdown ? clock.countdown(from: 3) : nil
        let ticks = kind == .ticks ? clock.ticks(every: .seconds(1)) : nil
        let (acknowledgements, acknowledged) = AsyncStream<Void>.makeStream()
        let reader = Task {
            var values: [Double] = []
            if let countdown {
                for await value in countdown {
                    values.append(Double(value))
                    acknowledged.yield(())
                }
            }
            if let ticks {
                for await value in ticks {
                    values.append(value)
                    acknowledged.yield(())
                }
            }
            binding.requestsContinuation.finish()
            acknowledged.finish()
            return values
        }
        let driver = Task {
            var requests = 0
            var acknowledgements = acknowledgements.makeAsyncIterator()
            for await deadline in binding.requests {
                requests += 1
                if requests == 1 {
                    await binding.advance(to: deadline)
                    guard await acknowledgements.next() != nil else { break }
                } else {
                    // Cancel while the producer is sleeping and the reader awaits its next value.
                    reader.cancel()
                    break
                }
            }
            return requests
        }

        let values = await reader.value
        let requests = await driver.value
        await binding.waitUntilIdle()
        #expect(values == (kind == .countdown ? [2] : [1]))
        #expect(requests == 2)
        #expect(await binding.pendingSleeps == 0)
    }

    enum WakeCase: CaseIterable, Sendable {
        case onTime, fractionalStepLate, multipleStepsLate, pastDeadline

        var times: [Duration] {
            switch self {
            case .onTime: [.seconds(2), .seconds(4), .seconds(6), .seconds(8)]
            case .fractionalStepLate: [.milliseconds(2500), .milliseconds(4500), .milliseconds(6500), .seconds(8)]
            case .multipleStepsLate: [.milliseconds(6500), .seconds(8)]
            case .pastDeadline: [.seconds(9)]
            }
        }

        var values: [Int] {
            switch self {
            case .onTime, .fractionalStepLate: [3, 2, 1, 0]
            case .multipleStepsLate: [1, 0]
            case .pastDeadline: [0]
            }
        }

        var deadlines: [Duration] {
            switch self {
            case .onTime, .fractionalStepLate: [.seconds(2), .seconds(4), .seconds(6), .seconds(8)]
            case .multipleStepsLate: [.seconds(2), .seconds(8)]
            case .pastDeadline: [.seconds(2)]
            }
        }
    }

    enum StreamKind: CaseIterable, Sendable {
        case countdown, ticks
    }

}


private actor ManualClock {
    // Writes occur only before a stream starts or while its producer is suspended
    // in sleep. Acknowledging each value prevents the driver advancing past a read.
    nonisolated(unsafe) private(set) var now = ContinuousClock.now
    nonisolated let requests: AsyncStream<ContinuousClock.Instant>
    nonisolated let requestsContinuation: AsyncStream<ContinuousClock.Instant>.Continuation
    private var pending: CheckedContinuation<Void, any Error>?
    private var idleWaiters: [CheckedContinuation<Void, Never>] = []

    init() {
        (requests, requestsContinuation) = AsyncStream.makeStream()
    }

    var pendingSleeps: Int { pending == nil ? 0 : 1 }

    func start(at offset: Duration) { now = now.advanced(by: offset) }

    func sleep(until deadline: ContinuousClock.Instant) async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                if Task.isCancelled {
                    continuation.resume(throwing: CancellationError())
                    return
                }
                precondition(pending == nil)
                pending = continuation
                requestsContinuation.yield(deadline)
            }
        } onCancel: {
            Task { await self.cancelSleep() }
        }
    }

    func advance(to instant: ContinuousClock.Instant) {
        precondition(pending != nil)
        precondition(instant >= now)
        now = instant
        let sleeper = pending
        pending = nil
        sleeper?.resume()
        resumeIdleWaiters()
    }

    func cancelSleep() {
        let sleeper = pending
        pending = nil
        sleeper?.resume(throwing: CancellationError())
        resumeIdleWaiters()
    }

    func waitUntilIdle() async {
        if pending == nil { return }
        await withCheckedContinuation { idleWaiters.append($0) }
    }

    private func resumeIdleWaiters() {
        let waiters = idleWaiters
        idleWaiters.removeAll()
        for waiter in waiters { waiter.resume() }
    }
}
