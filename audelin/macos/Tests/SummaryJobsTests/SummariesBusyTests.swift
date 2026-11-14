import SummaryJobs
import Testing

/// An app update waits while any call is being made or stored in this process.
@Suite struct SummariesBusyTests {
    @Test(arguments: [SummariesState.Call.Stage.reading, .recovering, .preparing, .claiming, .starting, .identifying, .checkpointing,
                      .noting, .publishing, .saving, .retrying, .discarding, .observed])
    func aCallAtWorkIsBusy(stage: SummariesState.Call.Stage) {
        #expect(SummariesReducer.busy(.init(calls: ["a": .init(stage: .succeeded), "b": .init(stage: stage)])))
    }
    @Test(arguments: [SummariesState.Call.Stage.waiting, .pending, .succeeded, .failed, .interrupted, .unavailable])
    func aCallAtRestIsNotBusy(stage: SummariesState.Call.Stage) {
        #expect(!SummariesReducer.busy(.init(calls: ["a": .init(stage: stage)])))
    }
    @Test func noCallsAreNotBusy() {
        #expect(!SummariesReducer.busy(.init()))
    }
}
