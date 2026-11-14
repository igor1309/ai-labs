import SummaryJobs
import Testing

@Suite struct SummariesRequestReducerTests {
    let format = FormatSpy()
    static let open: [SummariesState.Call.Stage?] = [nil, .waiting, .succeeded, .failed, .interrupted, .unavailable]

    @Test(arguments: open) func aRequestReadsTheStoredTranscript(stage: SummariesState.Call.Stage?) {
        assert(make(stage), .request("call")) { $0.calls["call"] = .init(stage: .reading, requested: true, status: "reading:false") }
        #expect(format.payloads == [.init(stage: .reading, warning: false)])
    }
    @Test(arguments: open) func aRequestDeliversRead(stage: SummariesState.Call.Stage?) {
        assert(make(stage), .request("call"), delivers: .read("call"))
    }
    @Test(arguments: [SummariesState.Call.Stage.reading, .preparing, .claiming, .noting, .observed, .retrying])
    func aRequestForABusyCallChangesNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .request("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesState.Call.Stage.reading, .noting])
    func aRequestForABusyCallDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .request("call"), delivers: nil)
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .settled]) func aRequestAfterShutdownChangesNothing(lifecycle: SummariesState.Lifecycle) {
        assert(makeState(lifecycle: lifecycle), .request("call"))
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .settled]) func aRequestAfterShutdownDeliversNothing(lifecycle: SummariesState.Lifecycle) {
        assert(makeState(lifecycle: lifecycle), .request("call"), delivers: nil)
    }
    @Test func theReadTranscriptIsPrepared() {
        let submission = makeSubmission(requested: true)
        assert(makeReading(), .submit(submission)) {
            $0.calls["call"] = .init(stage: .preparing, requested: true, submission: submission, status: "preparing:false")
        }
    }
    @Test func theReadTranscriptDeliversPrepare() {
        assert(makeReading(), .submit(makeSubmission(requested: true)), delivers: .prepare(makeSubmission(requested: true)))
    }
    @Test func aTranscriptReadDuringShutdownDropsTheCall() {
        var state = makeReading(); state.lifecycle = .draining
        assert(state, .submit(makeSubmission(requested: true))) { $0.calls["call"] = nil; $0.lifecycle = .settled }
    }
    @Test func aTranscriptReadDuringShutdownDeliversNothing() {
        var state = makeReading(); state.lifecycle = .draining
        assert(state, .submit(makeSubmission(requested: true)), delivers: nil)
    }
    @Test func aFailedReadFailsTheCallSoTheUserCanRetry() {
        assert(makeReading(), .readFailed("call")) {
            $0.calls["call"]?.stage = .failed; $0.calls["call"]?.status = "failed:false"; $0.calls["call"]?.retryable = true
        }
    }
    @Test func aFailedReadDeliversNothing() {
        assert(makeReading(), .readFailed("call"), delivers: nil)
    }
    @Test func aFailedReadForACallNotReadingChangesNothing() {
        assert(make(.noting), .readFailed("call"))
    }
    @Test func aRetryOfAFailedReadReadsAgain() {
        assert(makeFailedRead(), .retry("call")) { $0.calls["call"] = .init(stage: .reading, requested: true, status: "reading:false") }
    }
    @Test func aRetryOfAFailedReadDeliversRead() {
        assert(makeFailedRead(), .retry("call"), delivers: .read("call"))
    }
    @Test func aRetryOfAJoblessCallTheUserDidNotAskForChangesNothing() {
        assert(make(.failed), .retry("call"))
    }

    private func make(_ stage: SummariesState.Call.Stage?) -> SummariesState {
        makeState(calls: stage.map { ["call": .init(stage: $0)] } ?? [:])
    }
    private func makeReading() -> SummariesState { makeState(calls: ["call": .init(stage: .reading, requested: true)]) }
    private func makeFailedRead() -> SummariesState {
        makeState(calls: ["call": .init(stage: .failed, requested: true, retryable: true)])
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

@Suite struct SummariesRequestEffectHandlerTests {
    @Test func readAsksForTheCallsTranscript() async {
        let preparation = PreparationSpy()
        _ = await makeSUT(preparation).handle(.read("call"))
        #expect(preparation.reads == ["call"])
    }
    @Test func readDeliversTheSubmission() async {
        let event = await makeSUT(PreparationSpy()).handle(.read("call"))
        #expect(event == .submit(makeSubmission(requested: true)))
    }
    @Test func aFailedReadDeliversReadFailed() async {
        let event = await makeSUT(PreparationSpy(submission: .failure(SpyFailure()))).handle(.read("call"))
        #expect(event == .readFailed("call"))
    }
    @Test func readDoesNothingElse() async {
        let preparation = PreparationSpy(), claims = ClaimsSpy(), records = RecordsSpy(), starts = StartsSpy()
        let storage = StorageSpy(), generation = GenerationsSpy()
        _ = await SummariesEffectHandler(preparation: preparation, claims: claims, records: records, starts: starts,
                                         storage: storage, generation: generation).handle(.read("call"))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty && records.payloads.isEmpty && starts.payloads.isEmpty
                && storage.payloads.isEmpty && generation.payloads.isEmpty)
    }
    private func makeSUT(_ preparation: PreparationSpy) -> SummariesEffectHandler {
        .init(preparation: preparation, claims: ClaimsSpy(), records: RecordsSpy(), starts: StartsSpy(),
              storage: StorageSpy(), generation: GenerationsSpy())
    }
}
