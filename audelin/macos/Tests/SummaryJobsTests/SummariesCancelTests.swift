import SummaryJobs
import Testing

@Suite struct SummariesCancelReducerTests {
    let format = FormatSpy()
    static let running: [SummariesState.Call.Stage] = [.claiming, .starting, .identifying, .checkpointing, .noting, .publishing, .saving]
    /// Each running stage with a result that answers it.
    static let answers: [(SummariesState.Call.Stage, SummariesEvent)] = [
        (.claiming, .claimed("call", owned: true, .init(stage: .pending, job: makeJob()))), (.starting, .started("call", owned: true)), (.identifying, .identified("call", [])), (.identifying, .identificationFailed("call")),
        (.checkpointing, .checkpointed("call")), (.noting, .noted("call", "n")), (.noting, .notesFailed("call")),
        (.publishing, .published("call")), (.saving, .saved("call")),
    ]

    @Test(arguments: running) func aCancelOnARunningStageRecordsTheIntent(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call")) { $0.calls["call"]?.cancelling = true; $0.calls["call"]?.status = "\(stage):false" }
        #expect(format.payloads == [.init(stage: stage, warning: false)])
    }
    @Test(arguments: running) func aCancelOnARunningStageDeliversAbort(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"), delivers: .abort(makeJob()))
    }
    @Test func anAbortChangesNothing() {
        assert(make(.noting, cancelling: true), .aborted("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test func anAbortDeliversNothing() {
        assert(make(.noting, cancelling: true), .aborted("call"), delivers: nil)
    }
    @Test func aCancelOnAStoredJobNotStartedDiscardsIt() {
        assert(make(.pending), .cancel("call")) {
            $0.calls["call"]?.stage = .discarding; $0.calls["call"]?.cancelling = true; $0.calls["call"]?.status = "discarding:false"
        }
    }
    @Test func aCancelOnAStoredJobNotStartedDeliversDiscard() {
        assert(make(.pending), .cancel("call"), delivers: .discard(makeJob()))
    }
    @Test func S15_droppingAMergedPartsStoredJobDiscardsIt() {
        assert(make(.pending), .drop("call")) {
            $0.calls["call"]?.stage = .discarding; $0.calls["call"]?.cancelling = true; $0.calls["call"]?.status = "discarding:false"
        }
    }
    @Test func S15_droppingAMergedPartsStoredJobDeliversDiscard() {
        assert(make(.pending), .drop("call"), delivers: .discard(makeJob()))
    }
    @Test func aSecondCancelChangesNothing() {
        assert(make(.noting, cancelling: true), .cancel("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.observed, .unavailable]) func aCancelOnAnUnrunJobInterruptsIt(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call")) { $0.calls["call"]?.stage = .interrupted; $0.calls["call"]?.status = "interrupted:false"; $0.calls["call"]?.retryable = true }
    }
    @Test(arguments: [SummariesState.Call.Stage.observed, .unavailable]) func aCancelOnAnUnrunJobDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"), delivers: nil)
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed, .interrupted, .retrying, .discarding])
    func aCancelOnAnotherStageChangesNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed, .interrupted, .retrying, .discarding])
    func aCancelOnAnotherStageDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"), delivers: nil)
    }

    @Test(arguments: answers) func aResultAfterACancelDiscards(stage: SummariesState.Call.Stage, event: SummariesEvent) {
        assert(make(stage, cancelling: true), event) { $0.calls["call"]?.stage = .discarding; $0.calls["call"]?.status = "discarding:false" }
        #expect(format.payloads == [.init(stage: .discarding, warning: false)])
    }
    @Test(arguments: answers) func aResultAfterACancelDeliversDiscard(stage: SummariesState.Call.Stage, event: SummariesEvent) {
        assert(make(stage, cancelling: true), event, delivers: .discard(makeJob()))
    }
    @Test func anObservedStartAfterACancelIsObserved() {
        assert(make(.starting, cancelling: true), .started("call", owned: false)) {
            $0.calls["call"]?.stage = .observed; $0.calls["call"]?.cancelling = false; $0.calls["call"]?.status = "observed:false"
        }
    }
    @Test func anUnownedClaimAfterACancelIsObservedWithoutTheCancel() {
        assert(make(.claiming, cancelling: true), .claimed("call", owned: false, .init(stage: .pending, job: makeJob()))) {
            $0.calls["call"] = .init(stage: .observed, job: makeJob(), status: "observed:false")
        }
    }
    @Test func anObservedStartAfterACancelDeliversNothing() {
        assert(make(.starting, cancelling: true), .started("call", owned: false), delivers: nil)
    }
    @Test func aStorageFailureAfterACancelFailsTheCall() {
        assert(make(.noting, cancelling: true), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.cancelling = false; $0.calls["call"]?.status = "failed:false"; $0.calls["call"]?.retryable = true }
    }
    @Test func aResultForAnotherStageAfterACancelChangesNothing() {
        assert(make(.noting, cancelling: true), .published("call"))
    }

    @Test func aDiscardDropsTheCall() {
        assert(make(.discarding, cancelling: true), .discarded("call")) { $0.calls["call"] = nil }
        #expect(format.payloads.isEmpty)
    }
    @Test func aDiscardDeliversNothing() {
        assert(make(.discarding, cancelling: true), .discarded("call"), delivers: nil)
    }
    @Test func aDiscardForACallNotDiscardingChangesNothing() {
        assert(make(.noting, cancelling: true), .discarded("call"))
    }
    @Test func aFailedDiscardFailsTheCall() {
        assert(make(.discarding, cancelling: true), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.cancelling = false; $0.calls["call"]?.status = "failed:false"; $0.calls["call"]?.retryable = true }
    }
    @Test func aFailedDiscardDeliversNothing() {
        assert(make(.discarding, cancelling: true), .storageFailed("call"), delivers: nil)
    }

    @Test func S15_aMergedCallsSubmissionWaitsForItsPartsDiscard() {
        assert(make(.discarding, cancelling: true), .submit(makeSubmission())) { $0.calls["call"]?.submission = makeSubmission() }
        assert(make(.discarding, cancelling: true), .submit(makeSubmission()), delivers: nil)
        let held = makeState(calls: ["call": .init(stage: .discarding, job: makeJob(), cancelling: true, submission: makeSubmission(requested: true))])
        assert(held, .submit(makeSubmission()))
    }
    @Test(arguments: [SummariesEvent.discarded("call"), .storageFailed("call")])
    func S15_aMergedCallsSubmissionIsPreparedOnceThePartsJobIsGone(event: SummariesEvent) {
        let held = makeState(calls: ["call": .init(stage: .discarding, job: makeJob(), cancelling: true, submission: makeSubmission())])
        assert(held, event) {
            $0.calls["call"] = .init(stage: .preparing, submission: makeSubmission())
            $0.calls["call"]?.status = "preparing:false"
        }
        #expect(format.payloads == [.init(stage: .preparing, warning: false)])
        assert(held, event, delivers: .prepare(makeSubmission()))
    }
    @Test func S15_aDiscardWithoutASubmissionStillDropsTheCall() {
        assert(make(.discarding, cancelling: true), .discarded("call"), delivers: nil)
    }

    private func make(_ stage: SummariesState.Call.Stage, cancelling: Bool = false) -> SummariesState {
        makeState(calls: ["call": .init(stage: stage, job: makeJob(), cancelling: cancelling)])
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void = { _ in },
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(SummariesReducer(format: format.call, badge: { _ in .none }).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(SummariesReducer(format: format.call, badge: { _ in .none }).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}

@Suite struct SummariesCancelEffectHandlerTests {
    @Test func discardRemovesTheJobAndDeliversDiscarded() async {
        let storage = StorageSpy()
        let event = await makeSUT(storage).handle(.discard(makeJob()))
        #expect(event == .discarded("call") && storage.payloads == [.discard(makeJob())])
    }
    @Test func aFailedDiscardReleasesAndDeliversStorageFailure() async {
        let storage = StorageSpy(fails: true)
        let event = await makeSUT(storage).handle(.discard(makeJob()))
        #expect(event == .storageFailed("call") && storage.payloads == [.discard(makeJob()), .release(makeJob())])
    }
    @Test func discardDoesNothingElse() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy(), records = RecordsSpy(), starts = StartsSpy(), generation = GenerationsSpy()
        _ = await SummariesEffectHandler(preparation: preparation, claims: claims, records: records, starts: starts,
                                         storage: StorageSpy(), generation: generation).handle(.discard(makeJob()))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty && records.payloads.isEmpty
                && starts.payloads.isEmpty && generation.payloads.isEmpty)
    }
    @Test func abortStopsTheJobsGenerationAndDeliversAborted() async {
        let generation = GenerationsSpy()
        let event = await SummariesEffectHandler(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: RecordsSpy(),
                                                 starts: StartsSpy(), storage: StorageSpy(), generation: generation).handle(.abort(makeJob()))
        #expect(event == .aborted("call") && generation.payloads == [.cancel(makeJob())])
    }
    @Test func abortDoesNothingElse() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy(), records = RecordsSpy(), starts = StartsSpy(), storage = StorageSpy()
        _ = await SummariesEffectHandler(preparation: preparation, claims: claims, records: records, starts: starts,
                                         storage: storage, generation: GenerationsSpy()).handle(.abort(makeJob()))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty && records.payloads.isEmpty
                && starts.payloads.isEmpty && storage.payloads.isEmpty)
    }
    @Test(arguments: [SummariesEffect.identify(makeJob()), .notes(makeJob(), []), .publish(makeJob(), "n", warning: false)])
    func otherEffectsDoNotDiscard(effect: SummariesEffect) async {
        let storage = StorageSpy()
        _ = await makeSUT(storage).handle(effect)
        #expect(!storage.payloads.contains(.discard(makeJob())))
    }
    private func makeSUT(_ storage: StorageSpy) -> SummariesEffectHandler {
        .init(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: RecordsSpy(), starts: StartsSpy(),
              storage: storage, generation: GenerationsSpy())
    }
}
