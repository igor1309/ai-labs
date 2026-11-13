import SummaryJobs
import Testing

@Suite struct SummariesRetryReducerTests {
    let format = FormatSpy()
    let fresh = SummariesSaved(stage: .pending, job: makeJob(), warning: true)

    @Test(arguments: [SummariesState.Call.Stage.failed, .interrupted]) func aRetryRunsTheJobAgain(stage: SummariesState.Call.Stage) {
        assert(make(stage, retryFailed: true), .retry("call")) {
            $0.calls["call"]?.stage = .retrying; $0.calls["call"]?.terminal = stage
            $0.calls["call"]?.retryFailed = false; $0.calls["call"]?.status = "retrying:false"
        }
        #expect(format.payloads == [.init(stage: .retrying, warning: false)])
    }
    @Test(arguments: [SummariesState.Call.Stage.failed, .interrupted]) func aRetryDeliversRetry(stage: SummariesState.Call.Stage) {
        assert(make(stage), .retry("call"), delivers: .retry(makeJob()))
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .unavailable, .pending, .noting, .observed, .retrying])
    func aRetryOfACallNotFailedOrInterruptedChangesNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .retry("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .unavailable, .pending, .noting, .observed, .retrying])
    func aRetryOfACallNotFailedOrInterruptedDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .retry("call"), delivers: nil)
    }
    @Test(arguments: [(SummariesState.Lifecycle.accepting, false), (.draining, true), (.ended, true)])
    func aRetryWithoutDispatchOrAfterShutdownChangesNothing(lifecycle: SummariesState.Lifecycle, dispatch: Bool) {
        assert(make(.failed, lifecycle: lifecycle, dispatch: dispatch), .retry("call"))
    }
    @Test(arguments: [(SummariesState.Lifecycle.accepting, false), (.draining, true), (.ended, true)])
    func aRetryWithoutDispatchOrAfterShutdownDeliversNothing(lifecycle: SummariesState.Lifecycle, dispatch: Bool) {
        assert(make(.failed, lifecycle: lifecycle, dispatch: dispatch), .retry("call"), delivers: nil)
    }
    @Test func aRetryOfACallWithoutAJobChangesNothing() {
        assert(makeState(calls: ["call": .init(stage: .failed)]), .retry("call"))
    }
    @Test func aRetryOfACallWithoutAJobDeliversNothing() {
        assert(makeState(calls: ["call": .init(stage: .failed)]), .retry("call"), delivers: nil)
    }

    @Test func aRetriedJobStartsWhileDispatching() {
        assert(makeRetrying(), .retried("call", fresh)) {
            $0.calls["call"] = .init(stage: .starting, job: makeJob(), warning: true, requested: true, status: "starting:true")
        }
        #expect(format.payloads == [.init(stage: .starting, warning: true)])
    }
    @Test func aRetriedJobDeliversStartWhileDispatching() {
        assert(makeRetrying(), .retried("call", fresh), delivers: .start(makeJob()))
    }
    @Test func aRetriedJobStaysPendingWithoutDispatch() {
        assert(makeRetrying(dispatch: false), .retried("call", fresh)) {
            $0.calls["call"] = .init(stage: .pending, job: makeJob(), warning: true, requested: true, status: "pending:true")
        }
    }
    @Test func aRetriedJobDeliversNothingWithoutDispatch() {
        assert(makeRetrying(dispatch: false), .retried("call", fresh), delivers: nil)
    }
    @Test(arguments: [SummariesState.Call.Stage.failed, .interrupted]) func aFailedRetryRestoresTheStageAndMarksIt(stage: SummariesState.Call.Stage) {
        assert(makeRetrying(from: stage), .retryFailed("call")) {
            $0.calls["call"]?.stage = stage; $0.calls["call"]?.retryFailed = true; $0.calls["call"]?.status = "\(stage):false"
        }
        #expect(format.payloads == [.init(stage: stage, warning: false)])
    }
    @Test func aFailedRetryDeliversNothing() {
        assert(makeRetrying(), .retryFailed("call"), delivers: nil)
    }
    @Test(arguments: [SummariesEvent.retried("call", .init(stage: .pending, job: makeJob())), .retryFailed("call")])
    func aRetryAnswerForACallNotRetryingChangesNothing(event: SummariesEvent) {
        assert(make(.failed), event)
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesEvent.retried("call", .init(stage: .pending, job: makeJob())), .retryFailed("call")])
    func aRetryAnswerForACallNotRetryingDeliversNothing(event: SummariesEvent) {
        assert(make(.failed), event, delivers: nil)
    }

    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed, .interrupted, .unavailable])
    func forgettingASettledCallDropsIt(stage: SummariesState.Call.Stage) {
        assert(make(stage), .forget("call")) { $0.calls["call"] = nil }
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed, .interrupted, .unavailable])
    func forgettingASettledCallDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .forget("call"), delivers: nil)
    }
    @Test(arguments: [SummariesState.Call.Stage.recovering, .preparing, .claiming, .pending, .starting, .noting, .saving, .retrying, .observed])
    func forgettingAnUnsettledCallChangesNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .forget("call"))
    }
    @Test(arguments: [SummariesState.Call.Stage.recovering, .pending, .noting, .retrying])
    func forgettingAnUnsettledCallDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .forget("call"), delivers: nil)
    }

    private func make(_ stage: SummariesState.Call.Stage, lifecycle: SummariesState.Lifecycle = .accepting, dispatch: Bool = true,
                      retryFailed: Bool = false) -> SummariesState {
        makeState(lifecycle: lifecycle, dispatch: dispatch, calls: ["call": .init(stage: stage, job: makeJob(), retryFailed: retryFailed)])
    }
    private func makeRetrying(from stage: SummariesState.Call.Stage = .failed, dispatch: Bool = true) -> SummariesState {
        makeState(dispatch: dispatch, calls: ["call": .init(stage: .retrying, job: makeJob(), terminal: stage, requested: true)])
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void = { _ in },
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(SummariesReducer(format: format.call).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(SummariesReducer(format: format.call).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}

@Suite struct SummariesRetryEffectHandlerTests {
    @Test func retryHandsTheJobToRecords() async {
        let records = RecordsSpy()
        _ = await makeSUT(records).handle(.retry(makeJob()))
        #expect(records.payloads == ["retry:job"])
    }
    @Test func retryDeliversTheJobSavedAnew() async {
        let saved = SummariesSaved(stage: .pending, job: makeJob(), warning: true)
        let event = await makeSUT(RecordsSpy(retried: .success(saved))).handle(.retry(makeJob()))
        #expect(event == .retried("call", saved))
    }
    @Test func aFailedRetryDeliversRetryFailure() async {
        let storage = StorageSpy()
        let event = await makeSUT(RecordsSpy(retried: .failure(SpyFailure())), storage).handle(.retry(makeJob()))
        #expect(event == .retryFailed("call") && storage.payloads.isEmpty)
    }
    @Test func retryDoesNothingElse() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy(), starts = StartsSpy(), storage = StorageSpy(), generation = GenerationsSpy()
        _ = await SummariesEffectHandler(preparation: preparation, claims: claims, records: RecordsSpy(), starts: starts,
                                         storage: storage, generation: generation).handle(.retry(makeJob()))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty && starts.payloads.isEmpty
                && storage.payloads.isEmpty && generation.payloads.isEmpty)
    }
    @Test(arguments: [SummariesEffect.load("call"), .prepare(makeSubmission()), .claim(makeJob()), .start(makeJob())])
    func otherEffectsDoNotRetry(effect: SummariesEffect) async {
        let records = RecordsSpy()
        _ = await makeSUT(records).handle(effect)
        #expect(!records.payloads.contains("retry:job"))
    }
    private func makeSUT(_ records: RecordsSpy, _ storage: StorageSpy = StorageSpy()) -> SummariesEffectHandler {
        .init(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: records, starts: StartsSpy(),
              storage: storage, generation: GenerationsSpy())
    }
}
