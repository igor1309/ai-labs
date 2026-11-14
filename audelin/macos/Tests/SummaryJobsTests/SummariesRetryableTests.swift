import SummaryJobs
import Testing

/// The reducer keeps each changed call's `retryable`: failed or interrupted, with a job to run again.
@Suite struct SummariesRetryableReducerTests {
    @Test func aFailedCallWithAJobIsRetryable() {
        let next = reduce(make(.noting), .storageFailed("call"))
        #expect(next.calls["call"]?.retryable == true)
    }
    @Test func anInterruptedCallWithAJobIsRetryable() {
        let next = reduce(make(.observed), .cancel("call"))
        #expect(next.calls["call"]?.retryable == true)
    }
    @Test func aFailedCallWithoutAJobIsNotRetryable() {
        let next = reduce(makeState(calls: ["call": .init(stage: .recovering)]), .loadFailed("call"))
        #expect(next.calls["call"]?.stage == .failed && next.calls["call"]?.retryable == false)
    }
    @Test func aRetriedCallIsNoLongerRetryable() {
        let next = reduce(make(.failed, retryable: true), .retry("call"))
        #expect(next.calls["call"]?.stage == .retrying && next.calls["call"]?.retryable == false)
    }
    @Test func aSucceededCallIsNotRetryable() {
        let next = reduce(makeState(calls: ["call": .init(stage: .saving, job: makeJob(), terminal: .succeeded)]), .saved("call"))
        #expect(next.calls["call"]?.stage == .succeeded && next.calls["call"]?.retryable == false)
    }
    @Test func aCallTheEventLeavesAloneKeepsItsMark() {
        var state = make(.noting)
        state.calls["other"] = .init(stage: .noting, job: makeJob(), retryable: true)
        let next = reduce(state, .storageFailed("call"))
        #expect(next.calls["other"]?.retryable == true)
    }
    @Test func anEventThatChangesNothingLeavesTheMark() {
        let state = make(.noting, retryable: true)
        #expect(reduce(state, .published("call")) == state)
    }

    private func make(_ stage: SummariesState.Call.Stage, retryable: Bool = false) -> SummariesState {
        makeState(calls: ["call": .init(stage: stage, job: makeJob(), retryable: retryable)])
    }
    private func reduce(_ state: SummariesState, _ event: SummariesEvent) -> SummariesState {
        SummariesReducer(format: { _, _ in "" }, badge: { _ in .none }).reduce(state, event).0
    }
}
