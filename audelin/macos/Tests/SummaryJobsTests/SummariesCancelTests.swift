import SummaryJobs
import Testing

@Suite struct SummariesCancelReducerTests {
    let format = FormatSpy()
    static let running: [SummariesState.Call.Stage] = [.starting, .identifying, .checkpointing, .noting, .publishing, .saving]
    /// Each running stage with a result that answers it.
    static let answers: [(SummariesState.Call.Stage, SummariesEvent)] = [
        (.starting, .started("call", owned: true)), (.identifying, .identified("call", [])), (.identifying, .identificationFailed("call")),
        (.checkpointing, .checkpointed("call")), (.noting, .noted("call", "n")), (.noting, .notesFailed("call")),
        (.publishing, .published("call")), (.saving, .saved("call")),
    ]

    @Test(arguments: running) func aCancelOnARunningStageRecordsTheIntent(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call")) { $0.calls["call"]?.cancelling = true; $0.calls["call"]?.status = "\(stage):false" }
        #expect(format.payloads == [.init(stage: stage, warning: false)])
    }
    @Test(arguments: running) func aCancelOnARunningStageDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"), delivers: nil)
    }
    @Test func aSecondCancelChangesNothing() {
        assert(make(.noting, cancelling: true), .cancel("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.observed, .unavailable]) func aCancelOnAnUnrunJobInterruptsIt(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call")) { $0.calls["call"]?.stage = .interrupted; $0.calls["call"]?.status = "interrupted:false" }
    }
    @Test(arguments: [SummariesState.Call.Stage.observed, .unavailable]) func aCancelOnAnUnrunJobDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"), delivers: nil)
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed, .interrupted, .pending, .retrying, .discarding])
    func aCancelOnAnotherStageChangesNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .cancel("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed, .interrupted, .pending, .retrying, .discarding])
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
            $0.calls["call"]?.stage = .observed; $0.calls["call"]?.status = "observed:false"
        }
    }
    @Test func anObservedStartAfterACancelDeliversNothing() {
        assert(make(.starting, cancelling: true), .started("call", owned: false), delivers: nil)
    }
    @Test func aStorageFailureAfterACancelFailsTheCall() {
        assert(make(.noting, cancelling: true), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.status = "failed:false" }
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
        assert(make(.discarding, cancelling: true), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.status = "failed:false" }
    }
    @Test func aFailedDiscardDeliversNothing() {
        assert(make(.discarding, cancelling: true), .storageFailed("call"), delivers: nil)
    }

    private func make(_ stage: SummariesState.Call.Stage, cancelling: Bool = false) -> SummariesState {
        makeState(calls: ["call": .init(stage: stage, job: makeJob(), cancelling: cancelling)])
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
