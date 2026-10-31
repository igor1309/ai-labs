import Testing

struct DrainExecutorTests {

    @Test(.timeLimit(.minutes(1)))
    func workEnqueuedAfterFinishStillRuns() async {

        let executor = DrainExecutor()
        executor.complete()
        await executor.finish()

        let ran = await Task(executorPreference: executor) { true }.value

        #expect(ran)
    }

    @Test(.timeLimit(.minutes(1)))
    func waitingForReductionLeavesTheExecutorFree() async {

        let executor = DrainExecutor()
        let counts = SessionModel.Counts()
        counts.addSent()
        let waiting = Task(executorPreference: executor) { await counts.waitUntilCaughtUp() }

        // A wait that polled would re-enqueue itself, and this would never return.
        executor.run()

        counts.addReduced()
        executor.complete()
        await executor.finish()
        await waiting.value
    }
}
