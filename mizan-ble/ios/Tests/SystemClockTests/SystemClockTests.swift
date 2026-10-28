import SystemClock
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

        for await value in clock.countdown(from: 3, every: .milliseconds(50)) {
            values.append(value)
        }

        #expect(values == [2, 1, 0])
        #expect(started.duration(to: .now) >= .milliseconds(150))
    }

    @Test func countdownStopsWhenReaderIsCancelled() async {
        let clock = SystemClock()
        let stream = clock.countdown(from: 3, every: .milliseconds(50))
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
        let stream = clock.ticks(every: .milliseconds(50))
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
        #expect(firstTick - first >= 0.05)
        for (previous, next) in zip(values, values.dropFirst()) {
            #expect(next - previous >= 0.05)
        }
        #expect(clock.now() >= values.last!)
    }
}
