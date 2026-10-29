import BlockingTestWork
import Synchronization
import Testing

struct BlockingTestWorkTests {

    @Test(.timeLimit(.minutes(1)))
    func cancelledExitStatusStopsTheChildAndReturnsItsRealStatus() async throws {

        let exited = Mutex<(@Sendable (Int32) -> Void)?>(nil)
        let launched = AsyncStream<Void>.makeStream()
        let stopped = AsyncStream<Void>.makeStream()
        let waiting = Task {
            try await exitStatus(
                launch: { report in
                    exited.withLock { $0 = report }
                    launched.continuation.finish()
                },
                stop: { stopped.continuation.finish() }
            )
        }
        for await _ in launched.stream {}
        waiting.cancel()
        for await _ in stopped.stream {}
        // Only a helper that waits past cancellation can see this status.
        let exit = try #require(exited.withLock { $0 })
        exit(15)

        #expect(try await waiting.value == 15)
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
