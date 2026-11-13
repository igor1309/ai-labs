import SummaryJobs
import Testing

@Suite struct SummariesShutdownReducerTests {
    let format = FormatSpy()
    static let interrupted: [SummariesState.Call.Stage] = [.starting, .identifying, .checkpointing, .noting, .publishing, .saving, .discarding]

    @Test(arguments: interrupted) func shutdownInterruptsRunningCallsAndDrains(stage: SummariesState.Call.Stage) {
        var state = make(["call": stage, "other": .pending])
        state.calls["call"]?.warning = true
        assert(state, .shutdown) {
            $0.lifecycle = .draining; $0.dispatch = false; $0.releasing = true
            $0.calls["call"]?.stage = .interrupted; $0.calls["call"]?.status = "interrupted:true"
        }
        #expect(format.payloads == [.init(stage: .interrupted, warning: true)])
    }
    @Test func shutdownDeliversOneReleaseOfEveryRunningJob() {
        assert(make(["a": .noting, "b": .saving, "c": .pending, "d": .succeeded]), .shutdown,
               delivers: .release([job("a"), job("b")]))
    }
    @Test func shutdownWithNothingRunningEnds() {
        assert(make(["call": .pending, "done": .succeeded]), .shutdown) { $0.lifecycle = .ended; $0.dispatch = false }
        #expect(format.payloads.isEmpty)
    }
    @Test func shutdownWithNothingRunningDeliversNothing() {
        assert(make(["call": .pending]), .shutdown, delivers: nil)
    }
    @Test(arguments: [SummariesState.Call.Stage.recovering, .preparing, .claiming, .retrying])
    func shutdownWaitsForStorageAnswersInFlight(stage: SummariesState.Call.Stage) {
        assert(make(["call": stage]), .shutdown) { $0.lifecycle = .draining; $0.dispatch = false }
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .ended]) func aSecondShutdownChangesNothing(lifecycle: SummariesState.Lifecycle) {
        assert(make(["call": .noting], lifecycle: lifecycle), .shutdown)
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .ended]) func aSecondShutdownDeliversNothing(lifecycle: SummariesState.Lifecycle) {
        assert(make(["call": .noting], lifecycle: lifecycle), .shutdown, delivers: nil)
    }

    @Test func theReleaseEndsADrainWithNothingInFlight() {
        assert(makeDraining(["call": .interrupted]), .released) { $0.releasing = false; $0.lifecycle = .ended }
    }
    @Test func theReleaseKeepsDrainingWhileAnAnswerIsInFlight() {
        assert(makeDraining(["call": .interrupted, "other": .claiming]), .released) { $0.releasing = false }
    }
    @Test func theReleaseDeliversNothing() {
        assert(makeDraining(["call": .interrupted]), .released, delivers: nil)
    }
    @Test func aReleaseNotAwaitedChangesNothing() {
        assert(make(["call": .interrupted], lifecycle: .draining), .released)
    }
    @Test func theLastAnswerInFlightEndsADrainWhoseReleaseAnswered() {
        assert(make(["call": .claiming], lifecycle: .draining, dispatch: false), .claimed("call", owned: true, .init(stage: .pending, job: job("call")))) {
            $0.lifecycle = .ended
            $0.calls["call"] = .init(stage: .pending, job: job("call"), status: "pending:false")
        }
    }
    @Test func aClaimDuringADrainDeliversNothing() {
        assert(make(["call": .claiming], lifecycle: .draining, dispatch: false),
               .claimed("call", owned: true, .init(stage: .pending, job: job("call"))), delivers: nil)
    }
    @Test(arguments: [SummariesEvent.noted("call", "n"), .saved("call"), .started("call", owned: true), .storageFailed("call"), .discarded("call")])
    func aLateResultIsIgnored(event: SummariesEvent) {
        assert(makeDraining(["call": .interrupted]), event)
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesEvent.noted("call", "n"), .saved("call"), .started("call", owned: true), .storageFailed("call")])
    func aLateResultDeliversNothing(event: SummariesEvent) {
        assert(makeDraining(["call": .interrupted]), event, delivers: nil)
    }

    @Test func refreshReloadsObservedCalls() {
        assert(make(["b": .observed, "a": .observed, "c": .noting]), .refresh)
        #expect(format.payloads.isEmpty)
    }
    @Test func refreshDeliversReloadOfObservedCalls() {
        assert(make(["b": .observed, "a": .observed, "c": .noting]), .refresh, delivers: .reload(["a", "b"]))
    }
    @Test func refreshWithoutObservedCallsDeliversNothing() {
        assert(make(["c": .noting]), .refresh, delivers: nil)
    }
    @Test func refreshAfterTheEndDeliversNothing() {
        assert(make(["a": .observed], lifecycle: .ended), .refresh, delivers: nil)
    }
    @Test(arguments: [(SummariesState.Call.Stage.pending, SummariesState.Call.Stage.observed), (.noting, .noting), (.succeeded, .succeeded)])
    func aReloadedCallTakesItsSavedJob(saved: SummariesState.Call.Stage, stage: SummariesState.Call.Stage) {
        let record = SummariesSaved(stage: saved, job: job("a"), warning: true, notes: "notes")
        assert(make(["a": .observed]), .reloaded(["a": record])) {
            $0.calls["a"] = .init(stage: stage, job: job("a"), warning: true, notes: "notes", status: "\(stage):true")
        }
        #expect(format.payloads == [.init(stage: stage, warning: true)])
    }
    @Test func aReloadedCallStorageNoLongerHoldsIsDropped() {
        assert(make(["a": .observed]), .reloaded(["a": .none])) { $0.calls["a"] = nil }
    }
    @Test func aReloadForACallNoLongerObservedChangesNothing() {
        assert(make(["a": .noting]), .reloaded(["a": .init(stage: .succeeded, job: job("a"))]))
    }
    @Test func aReloadDeliversNothing() {
        assert(make(["a": .observed]), .reloaded(["a": .none]), delivers: nil)
    }

    private func make(_ stages: [String: SummariesState.Call.Stage], lifecycle: SummariesState.Lifecycle = .accepting,
                      dispatch: Bool = true) -> SummariesState {
        makeState(lifecycle: lifecycle, dispatch: dispatch, calls: stages.reduce(into: [:]) { $0[$1.key] = .init(stage: $1.value, job: job($1.key)) })
    }
    private func makeDraining(_ stages: [String: SummariesState.Call.Stage]) -> SummariesState {
        var state = make(stages, lifecycle: .draining, dispatch: false); state.releasing = true; return state
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

/// A job for the named call.
private func job(_ call: String) -> Job { var job = makeJob(); job.call = call; return job }

@Suite struct SummariesShutdownEffectHandlerTests {
    @Test func releaseFreesEveryJobAndDeliversReleased() async {
        let storage = StorageSpy()
        var other = makeJob(); other.call = "other"
        let event = await makeSUT(storage: storage).handle(.release([makeJob(), other]))
        #expect(event == .released && storage.payloads == [.release(makeJob()), .release(other)])
    }
    @Test func reloadLoadsEachCall() async {
        let records = RecordsSpy()
        _ = await makeSUT(records: records).handle(.reload(["a", "b"]))
        #expect(records.payloads == ["a", "b"])
    }
    @Test(arguments: [false, true]) func reloadDeliversWhatStorageHolds(found: Bool) async {
        let saved = found ? SummariesSaved(stage: .noting, job: makeJob()) : nil
        let event = await makeSUT(records: RecordsSpy(result: .success(saved))).handle(.reload(["a"]))
        #expect(event == .reloaded(["a": saved]))
    }
    @Test func aCallThatFailsToLoadIsLeftOut() async {
        let event = await makeSUT(records: RecordsSpy(result: .failure(SpyFailure()))).handle(.reload(["a"]))
        #expect(event == .reloaded([:]))
    }
    @Test func releaseAndReloadDoNothingElse() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy(), starts = StartsSpy(), generation = GenerationsSpy()
        let sut = SummariesEffectHandler(preparation: preparation, claims: claims, records: RecordsSpy(), starts: starts,
                                         storage: StorageSpy(), generation: generation)
        _ = await sut.handle(.release([makeJob()])); _ = await sut.handle(.reload(["a"]))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty && starts.payloads.isEmpty && generation.payloads.isEmpty)
    }
    private func makeSUT(records: RecordsSpy = RecordsSpy(), storage: StorageSpy = StorageSpy()) -> SummariesEffectHandler {
        .init(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: records, starts: StartsSpy(),
              storage: storage, generation: GenerationsSpy())
    }
}
