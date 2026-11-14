import SummaryJobs
import Testing

/// Every path that renders a call's status renders its badge from the same stage, and only those paths.
@Suite struct SummariesBadgeReducerTests {
    let badge = BadgeSpy(stub: .pending)

    @Test func aChangedCallTakesTheRenderedBadge() {
        assert(makeState(), .submit(makeSubmission())) {
            $0.calls["call"] = .init(stage: .preparing, submission: makeSubmission(), status: "preparing:false", badge: .pending)
        }
        #expect(badge.payloads == [.preparing])
    }
    @Test func aDiscardAfterACancelRendersTheDiscardingBadge() {
        let state = makeState(calls: ["call": .init(stage: .noting, job: makeJob(), cancelling: true)])
        assert(state, .noted("call", "n")) {
            $0.calls["call"]?.stage = .discarding; $0.calls["call"]?.status = "discarding:false"; $0.calls["call"]?.badge = .pending
        }
        #expect(badge.payloads == [.discarding])
    }
    @Test func stoppingDispatchRendersThePendingBadge() {
        let state = makeState(calls: ["call": .init(stage: .starting, job: makeJob())])
        assert(state, .stopDispatch) {
            $0.dispatch = false; $0.calls["call"]?.stage = .pending; $0.calls["call"]?.status = "pending:false"; $0.calls["call"]?.badge = .pending
        }
        #expect(badge.payloads == [.pending])
    }
    @Test func shutdownRendersTheInterruptedBadge() {
        let state = makeState(calls: ["call": .init(stage: .noting, job: makeJob())])
        assert(state, .shutdown) {
            $0.lifecycle = .draining; $0.dispatch = false; $0.releasing = true
            $0.calls["call"]?.stage = .interrupted; $0.calls["call"]?.status = "interrupted:false"; $0.calls["call"]?.badge = .pending; $0.calls["call"]?.retryable = true
        }
        #expect(badge.payloads == [.interrupted])
    }
    @Test func aReloadRendersTheReloadedBadge() {
        let state = makeState(calls: ["call": .init(stage: .observed, job: makeJob())])
        assert(state, .reloaded(["call": .init(stage: .succeeded, job: makeJob())])) {
            $0.calls["call"] = .init(stage: .succeeded, job: makeJob(), status: "succeeded:false", badge: .pending)
        }
        #expect(badge.payloads == [.succeeded])
    }
    @Test(arguments: [SummariesEvent.prepared("call", makeJob(), notesOn: false), .forget("call"), .discarded("call"), .submit(makeSubmission())])
    func aCallRemovedOrUnchangedRendersNoBadge(event: SummariesEvent) {
        _ = reducer.reduce(makeState(calls: ["call": .init(stage: .preparing, submission: makeSubmission())]), event)
        #expect(badge.payloads.isEmpty)
    }

    private var reducer: SummariesReducer { SummariesReducer(format: FormatSpy().call, badge: badge.call) }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(reducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
}
