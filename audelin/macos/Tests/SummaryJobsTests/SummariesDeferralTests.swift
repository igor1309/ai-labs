import SummaryJobs
import Testing

@Suite struct SummariesDeferralReducerTests {
    let format = FormatSpy()

    @Test(arguments: [false, true]) func aTransactionIsHeld(running: Bool) {
        assert(make(transaction: !running), .transaction(running: running)) { $0.transaction = running }
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [false, true]) func aTransactionDeliversNothing(running: Bool) {
        assert(make(transaction: !running), .transaction(running: running), delivers: nil)
    }
    @Test(arguments: [false, true]) func anUnchangedTransactionChangesNothing(running: Bool) {
        assert(make(transaction: running), .transaction(running: running))
    }
    @Test(arguments: [false, true]) func anUnchangedTransactionDeliversNothing(running: Bool) {
        assert(make(transaction: running), .transaction(running: running), delivers: nil)
    }

    @Test func notesMadeDuringATransactionAreDeferred() {
        assert(make(transaction: true, ["call": noting()]), .noted("call", "notes")) {
            $0.calls["call"]?.notes = "notes"; $0.calls["call"]?.stage = .deferred; $0.calls["call"]?.status = "deferred:false"
        }
        #expect(format.payloads == [.init(stage: .deferred, warning: false)])
    }
    @Test func notesMadeDuringATransactionDeliverNothing() {
        assert(make(transaction: true, ["call": noting()]), .noted("call", "notes"), delivers: nil)
    }

    @Test func theTransactionsEndPublishesTheFirstDeferredCall() {
        assert(make(transaction: true, ["b": deferred("b"), "a": deferred("a")]), .transaction(running: false)) {
            $0.transaction = false
            $0.calls["a"]?.stage = .publishing; $0.calls["a"]?.status = "publishing:false"
        }
        #expect(format.payloads == [.init(stage: .publishing, warning: false)])
    }
    @Test(arguments: [false, true]) func theTransactionsEndDeliversItsPublish(warning: Bool) {
        assert(make(transaction: true, ["b": deferred("b"), "a": deferred("a", warning: warning)]), .transaction(running: false),
               delivers: .publish(makeJob(call: "a"), "notes", warning: warning))
    }
    @Test func aSaveAfterTheTransactionPublishesTheNextDeferredCall() {
        let state = make(["a": .init(stage: .saving, job: makeJob(call: "a"), terminal: .succeeded), "b": deferred("b")])
        assert(state, .saved("a")) {
            $0.calls["a"]?.stage = .succeeded; $0.calls["a"]?.status = "succeeded:false"
            $0.calls["b"]?.stage = .publishing; $0.calls["b"]?.status = "publishing:false"
        }
    }
    @Test func aSaveAfterTheTransactionDeliversTheNextPublish() {
        let state = make(["a": .init(stage: .saving, job: makeJob(call: "a"), terminal: .succeeded), "b": deferred("b")])
        assert(state, .saved("a"), delivers: .publish(makeJob(call: "b"), "notes", warning: false))
    }
    @Test func aDeferredCallWaitsWhileTheTransactionRuns() {
        let state = make(transaction: true, ["a": .init(stage: .saving, job: makeJob(call: "a"), terminal: .succeeded), "b": deferred("b")])
        assert(state, .saved("a")) { $0.calls["a"]?.stage = .succeeded; $0.calls["a"]?.status = "succeeded:false" }
    }
    @Test func aDeferredCallWaitingOnTheTransactionDeliversNothing() {
        let state = make(transaction: true, ["a": .init(stage: .saving, job: makeJob(call: "a"), terminal: .succeeded), "b": deferred("b")])
        assert(state, .saved("a"), delivers: nil)
    }

    @Test func cancellingADeferredCallDiscardsIt() {
        assert(make(transaction: true, ["call": deferred("call")]), .cancel("call")) {
            $0.calls["call"]?.stage = .discarding; $0.calls["call"]?.cancelling = true; $0.calls["call"]?.status = "discarding:false"
        }
    }
    @Test func cancellingADeferredCallDeliversDiscard() {
        assert(make(transaction: true, ["call": deferred("call")]), .cancel("call"), delivers: .discard(makeJob(call: "call")))
    }
    @Test func shutdownInterruptsADeferredCall() {
        assert(make(transaction: true, ["call": deferred("call")]), .shutdown) {
            $0.lifecycle = .draining; $0.dispatch = false; $0.releasing = true
            $0.calls["call"]?.stage = .interrupted; $0.calls["call"]?.status = "interrupted:false"; $0.calls["call"]?.retryable = true
        }
    }
    @Test func shutdownDeliversTheDeferredCallsRelease() {
        assert(make(transaction: true, ["call": deferred("call")]), .shutdown, delivers: .release([makeJob(call: "call")]))
    }
    @Test func aDeferredCallDoesNotPublishAfterShutdown() {
        let state = make(transaction: true, ["call": deferred("call")], lifecycle: .draining)
        assert(state, .transaction(running: false)) { $0.transaction = false; $0.lifecycle = .settled }
    }
    @Test func aDeferredCallAfterShutdownDeliversNothing() {
        assert(make(transaction: true, ["call": deferred("call")], lifecycle: .draining), .transaction(running: false), delivers: nil)
    }

    private func noting() -> SummariesState.Call { .init(stage: .noting, job: makeJob()) }
    private func deferred(_ call: String, warning: Bool = false) -> SummariesState.Call {
        .init(stage: .deferred, job: makeJob(call: call), warning: warning, notes: "notes")
    }
    private func make(transaction: Bool = false, _ calls: [String: SummariesState.Call] = [:],
                      lifecycle: SummariesState.Lifecycle = .accepting) -> SummariesState {
        .init(lifecycle: lifecycle, dispatch: lifecycle == .accepting, calls: calls, transaction: transaction)
    }
    private var reducer: SummariesReducer { SummariesReducer(format: format.call, badge: { _ in .none }) }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void = { _ in },
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(reducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(reducer.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}
