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
}
