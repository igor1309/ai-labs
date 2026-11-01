import BlockingTestWork
import Dispatch
import Synchronization
import Testing

struct BlockingTestWorkTests {

    @Test(.timeLimit(.minutes(1)))
    func cancelledExitStatusStopsTheChildAndReturnsItsRealStatus() async throws {

        struct ExitReporter: Sendable {
            let report: @Sendable (Int32) -> Void
        }
        let exited = Mutex<ExitReporter?>(nil)
        let launched = AsyncStream<Void>.makeStream()
        let stopped = AsyncStream<Void>.makeStream()
        let waiting = Task {
            try await exitStatus(
                launch: { report in
                    exited.withLock { $0 = ExitReporter(report: report) }
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
        exit.report(15)

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

struct ThreadBarrierTests {

    @Test func threadsOfTheirOwnMeetIt() async {

        let barrier = ThreadBarrier()
        await withTaskGroup { group in
            for index in 0..<barrier.count {
                let queue = DispatchQueue(label: "test.ThreadBarrier.\(index)")
                group.addTask {
                    await withCheckedContinuation { done in
                        queue.async {
                            barrier.arrive()
                            done.resume()
                        }
                    }
                }
            }
        }
        #expect(barrier.met)
    }

    @Test func workSharingAThreadDoesNotMeetItEvenThoughAllOfItArrives() async {

        let barrier = ThreadBarrier(patience: 0.2)
        let shared = DispatchQueue(label: "test.ThreadBarrier.shared")
        await withTaskGroup { group in
            for _ in 0..<barrier.count {
                group.addTask {
                    await withCheckedContinuation { done in
                        shared.async {
                            barrier.arrive()
                            done.resume()
                        }
                    }
                }
            }
        }
        #expect(!barrier.met)
    }

}
