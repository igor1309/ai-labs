import BlockingTestWork
import Synchronization
import Testing

struct BlockingTestWorkTests {

    @Test(.timeLimit(.minutes(1)))
    func cancelledExitStatusStopsTheChildAndReturnsOnlyAfterItExits() async throws {

        let events = Mutex<[String]>([])
        let exited = Mutex<(@Sendable (Int32) -> Void)?>(nil)
        let launched = AsyncStream<Void>.makeStream()
        let stopped = AsyncStream<Void>.makeStream()
        let waiting = Task {
            let result: Result<Int32, any Error>
            do {
                result = .success(try await exitStatus(
                    launch: { report in
                        exited.withLock { $0 = report }
                        launched.continuation.finish()
                    },
                    stop: {
                        events.withLock { $0.append("stop") }
                        stopped.continuation.finish()
                    }
                ))
            } catch {
                result = .failure(error)
            }
            events.withLock { $0.append("returned") }
            return result
        }
        for await _ in launched.stream {}
        waiting.cancel()
        for await _ in stopped.stream {}
        // A helper that returns on cancellation is already runnable here; let it run first.
        for _ in 0..<1_000 where !events.withLock({ $0.contains("returned") }) { await Task.yield() }
        events.withLock { $0.append("exit") }
        let exit = try #require(exited.withLock { $0 })
        exit(15)

        let result = await waiting.value
        #expect(events.withLock { $0 } == ["stop", "exit", "returned"])
        #expect(throws: CancellationError.self) { try result.get() }
    }

    @Test func cleanupRunsAfterAFailingBodyAndTheBodyErrorWins() async throws {

        struct BodyFailure: Error {}
        struct CleanupFailure: Error {}
        let cleaned = Mutex(false)
        await #expect(throws: BodyFailure.self) {
            try await withCleanup {
                throw BodyFailure()
            } cleanup: {
                cleaned.withLock { $0 = true }
                throw CleanupFailure()
            }
        }
        #expect(cleaned.withLock { $0 })
    }
}
