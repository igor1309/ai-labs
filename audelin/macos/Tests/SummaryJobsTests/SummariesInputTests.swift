import SummaryJobs
import Testing

@Suite struct SummaryInputReducerTests {
    @Test(arguments: [SummariesStage.pending, .failed, .interrupted])
    func loadingDropsAnAttemptMadeFromAnotherTranscript(stage: SummariesStage) {
        let saved = makeSaved(stage, input: "changed")
        assert(makeRecovering(), .recovered("call", saved)) {
            $0.calls["call"] = .init(stage: .discarding, job: makeJob(), replacement: .automatic, status: "discarding:false")
        }
        assert(makeRecovering(), .recovered("call", saved), delivers: .discard(makeJob()))
    }
    @Test(arguments: [SummariesStage.pending, .failed, .interrupted], [false, true])
    func matchingOrUnreadableInputKeepsTheAttempt(stage: SummariesStage, unreadable: Bool) {
        let saved = makeSaved(stage, input: unreadable ? nil : "input")
        assert(makeRecovering(), .recovered("call", saved)) {
            $0.calls["call"] = .init(stage: stage, job: makeJob(), status: "\(stage):false", retryable: stage == .failed || stage == .interrupted)
        }
        assert(makeRecovering(), .recovered("call", saved), delivers: nil)
    }
    @Test func unreadablePendingInputDoesNotResume() {
        let state = makeState(calls: ["call": .init(stage: .recovering)])
        let event = SummariesEvent.recovered("call", makeSaved(.pending, input: nil))
        assert(state, event) { $0.calls["call"] = .init(stage: .pending, job: makeJob(), status: "pending:false") }
        assert(state, event, delivers: nil)
    }
    @Test(arguments: [SummariesStage.failed, .unavailable])
    func aFreshRetryFailureIsReported(stage: SummariesStage) {
        let state = makeState(calls: ["call": .init(stage: .reading, requested: true, replacement: .request)])
        if stage == .failed {
            assert(state, .readFailed("call")) {
                $0.calls["call"]?.stage = .failed; $0.calls["call"]?.replacement = nil
                $0.calls["call"]?.retryFailed = true; $0.calls["call"]?.retryable = true; $0.calls["call"]?.status = "failed:false"
            }
            assert(state, .readFailed("call"), delivers: nil)
        } else {
            let preparing = makeState(calls: ["call": .init(stage: .preparing, requested: true, replacement: .request, submission: makeSubmission(usable: false, requested: true))])
            assert(preparing, .prepared("call", makeJob(), notesOn: true)) {
                $0.calls["call"]?.stage = .unavailable; $0.calls["call"]?.job = makeJob(); $0.calls["call"]?.submission = nil
                $0.calls["call"]?.replacement = nil; $0.calls["call"]?.retryFailed = true; $0.calls["call"]?.status = "unavailable:false"
            }
            assert(preparing, .prepared("call", makeJob(), notesOn: true), delivers: nil)
        }
    }
    @Test func runningAttemptIsNeverComparedOrDropped() {
        let saved = makeSaved(.observed, input: "changed")
        assert(makeRecovering(), .recovered("call", saved)) {
            $0.calls["call"] = .init(stage: .observed, job: makeJob(), status: "observed:false")
        }
        assert(makeRecovering(), .recovered("call", saved), delivers: nil)
    }
    @Test(arguments: [SummariesStage.failed, .interrupted])
    func retryWithAChangedTranscriptDiscardsBeforeRequesting(stage: SummariesStage) {
        let state = makeRetrying(stage)
        assert(state, .retryInput("call", "changed")) {
            $0.calls["call"]?.stage = .discarding; $0.calls["call"]?.replacement = .request
            $0.calls["call"]?.status = "discarding:false"
        }
        assert(state, .retryInput("call", "changed"), delivers: .discard(makeJob()))
    }
    @Test func matchingRetryRetainsItsSavedJob() {
        let state = makeRetrying(.failed)
        assert(state, .retryInput("call", "input")) { $0.calls["call"]?.status = "retrying:false" }
        assert(state, .retryInput("call", "input"), delivers: .retry(makeJob()))
    }
    @Test func unreadableRetryKeepsTheAttempt() {
        let state = makeRetrying(.failed)
        assert(state, .retryInput("call", nil)) {
            $0.calls["call"]?.stage = .failed; $0.calls["call"]?.retryFailed = true
            $0.calls["call"]?.retryable = true; $0.calls["call"]?.status = "failed:false"
        }
        assert(state, .retryInput("call", nil), delivers: nil)
    }
    @Test func staleRetryBecomesAFreshRequestAfterDiscard() {
        let state = makeState(calls: ["call": .init(stage: .discarding, job: makeJob(), replacement: .request)])
        assert(state, .discarded("call")) {
            $0.calls["call"] = .init(stage: .reading, requested: true, replacement: .request, status: "reading:false")
        }
        assert(state, .discarded("call"), delivers: .read("call"))
    }
    @Test func staleLoadSettlesWithNoJobAfterDiscard() {
        let state = makeState(calls: ["call": .init(stage: .discarding, job: makeJob(), replacement: .automatic)])
        assert(state, .discarded("call")) { $0.calls["call"] = nil }
        assert(state, .discarded("call"), delivers: nil)
    }
    @Test func automaticSubmissionWaitsForStaleDiscard() {
        let state = makeState(calls: ["call": .init(stage: .recovering, submission: makeSubmission())])
        assert(state, .recovered("call", makeSaved(.pending, input: "changed"))) {
            $0.calls["call"] = .init(stage: .discarding, job: makeJob(), replacement: .automatic, submission: makeSubmission(), status: "discarding:false")
        }
        assert(state, .recovered("call", makeSaved(.pending, input: "changed")), delivers: .discard(makeJob()))
        let discarding = makeState(calls: ["call": .init(stage: .discarding, job: makeJob(), replacement: .automatic, submission: makeSubmission())])
        assert(discarding, .discarded("call")) {
            $0.calls["call"] = .init(stage: .preparing, submission: makeSubmission(), status: "preparing:false")
        }
        assert(discarding, .discarded("call"), delivers: .prepare(makeSubmission()))
    }
    @Test func failedStaleDiscardDoesNotStartReplacement() {
        let state = makeState(calls: ["call": .init(stage: .discarding, job: makeJob(), replacement: .automatic, submission: makeSubmission())])
        assert(state, .storageFailed("call")) {
            $0.calls["call"]?.stage = .failed; $0.calls["call"]?.retryable = true; $0.calls["call"]?.status = "failed:false"
        }
        assert(state, .storageFailed("call"), delivers: nil)
    }
    @Test func refreshDropsAStaleInactiveAttempt() {
        var state = makeState(calls: ["call": .init(stage: .failed, job: makeJob())]); state.refreshing = true
        let event = SummariesEvent.reloaded(["call": makeSaved(.failed, input: "changed")])
        assert(state, event) {
            $0.refreshing = false; $0.calls["call"]?.stage = .discarding
            $0.calls["call"]?.replacement = .automatic; $0.calls["call"]?.status = "discarding:false"
        }
        assert(state, event, delivers: .discard(makeJob()))
    }
    @Test func refreshDrainsEveryStaleAttempt() {
        var first = makeJob(call: "a"); first.id = "job-a"
        var second = makeJob(call: "b"); second.id = "job-b"
        var state = makeState(calls: ["a": .init(stage: .failed, job: first), "b": .init(stage: .interrupted, job: second)])
        state.refreshing = true
        let event = SummariesEvent.reloaded(["a": .init(stage: .failed, job: first, currentInput: "changed"),
                                            "b": .init(stage: .interrupted, job: second, currentInput: "changed")])
        assert(state, event) {
            $0.refreshing = false
            $0.calls["a"] = .init(stage: .discarding, job: first, replacement: .automatic, status: "discarding:false")
            $0.calls["b"] = .init(stage: .discarding, job: second, replacement: .queuedAutomatic, status: "discarding:false")
        }
        assert(state, event, delivers: .discard(first))
        let discarding = makeState(calls: ["a": .init(stage: .discarding, job: first, replacement: .automatic),
                                          "b": .init(stage: .discarding, job: second, replacement: .queuedAutomatic)])
        assert(discarding, .discarded("a")) {
            $0.calls["a"] = nil; $0.calls["b"]?.replacement = .automatic
        }
        assert(discarding, .discarded("a"), delivers: .discard(second))
    }
    @Test func anAutomaticClaimDropsAnotherTranscriptsInactiveAttempt() {
        var saved = makeSaved(.pending, input: nil); saved.job.input = "old"
        let event = SummariesEvent.claimed("call", owned: false, saved)
        assert(makeClaiming(), event) {
            var old = makeJob(); old.input = "old"
            $0.calls["call"] = .init(stage: .discarding, job: old, replacement: .automatic, submission: makeSubmission(), status: "discarding:false")
        }
        var old = makeJob(); old.input = "old"
        assert(makeClaiming(), event, delivers: .discard(old))
    }

    private func makeSaved(_ stage: SummariesStage, input: String?) -> SummariesSaved {
        .init(stage: stage, job: makeJob(), currentInput: input)
    }
    private func makeRecovering() -> SummariesState { makeState(dispatch: false, calls: ["call": .init(stage: .recovering)]) }
    private func makeRetrying(_ stage: SummariesStage) -> SummariesState { makeState(calls: ["call": .init(stage: .retrying, job: makeJob(), terminal: stage)]) }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(SummariesReducer(format: { "\($0):\($1)" }, badge: { _ in .none }).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(SummariesReducer(format: { "\($0):\($1)" }, badge: { _ in .none }).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}

@Suite struct SummaryJobsTests {
    @Test(arguments: [SummariesStage.pending, .failed, .interrupted])
    func loadingDropsAnAttemptMadeFromAnotherTranscript(stage: SummariesStage) async {
        let preparation = PreparationSpy(currentInput: .success("changed")), storage = StorageSpy(), generation = GenerationsSpy()
        let sut = handler(preparation: preparation, records: RecordsSpy(result: .success(.init(stage: stage, job: makeJob()))), storage: storage, generation: generation)
        let event = await sut.handle(.load("call"))
        #expect(event == .recovered("call", .init(stage: stage, job: makeJob(), currentInput: "changed")))
        #expect(preparation.reads == ["call"])
        let reducer = SummariesReducer(format: { "\($0):\($1)" }, badge: { _ in .none })
        let (discarding, effect) = reducer.reduce(makeState(calls: ["call": .init(stage: .recovering)]), event)
        #expect(effect == .discard(makeJob()))
        let result = await sut.handle(.discard(makeJob()))
        #expect(result == .discarded("call"))
        let (settled, next) = reducer.reduce(discarding, result)
        #expect(settled.calls.isEmpty && next == nil)
        #expect(storage.payloads == [.discard(makeJob())] && generation.payloads.isEmpty)
    }
    @Test(arguments: [false, true])
    func runningAttemptIsNeverComparedOrDropped(refresh: Bool) async {
        let preparation = PreparationSpy(currentInput: .success("changed")), storage = StorageSpy(), generation = GenerationsSpy()
        let saved = SummariesSaved(stage: .observed, job: makeJob())
        let sut = handler(preparation: preparation, records: RecordsSpy(result: .success(saved)), storage: storage, generation: generation)
        let event = await sut.handle(refresh ? .reload(["call"]) : .load("call"))
        #expect(event == (refresh ? .reloaded(["call": saved]) : .recovered("call", saved)))
        #expect(preparation.reads.isEmpty && storage.payloads.isEmpty && generation.payloads.isEmpty)
    }
    @Test func retryWithAChangedTranscriptRunsAFreshJob() async {
        var fresh = makeJob(); fresh.id = "fresh"; fresh.input = "changed"; fresh.speakers = false
        let preparation = PreparationSpy(job: fresh, currentInput: .success("changed"))
        let claims = ClaimsSpy(result: .success((true, .init(stage: .pending, job: fresh))))
        let storage = StorageSpy(), generation = GenerationsSpy(), records = RecordsSpy()
        let sut = handler(preparation: preparation, claims: claims, records: records, storage: storage, generation: generation)
        let reducer = SummariesReducer(format: { "\($0):\($1)" }, badge: { _ in .none })
        var state = makeState(calls: ["call": .init(stage: .failed, job: makeJob())])
        var event = SummariesEvent.retry("call")
        while true {
            let (next, effect) = reducer.reduce(state, event); state = next
            guard let effect else { break }
            event = await sut.handle(effect)
        }
        #expect(state.calls["call"]?.stage == .succeeded)
        #expect(storage.payloads.first == .discard(makeJob()))
        #expect(!records.payloads.contains("retry:job"))
        #expect(claims.payloads.count == 1 && claims.payloads.first?.id == "fresh" && claims.payloads.first?.input == "changed")
        #expect(generation.payloads.count == 1)
    }
    @Test(arguments: [false, true])
    func comparisonReportsMatchingOrUnreadableInput(unreadable: Bool) async {
        let preparation = PreparationSpy(currentInput: unreadable ? .failure(SpyFailure()) : .success("input"))
        let saved = SummariesSaved(stage: .pending, job: makeJob())
        let sut = handler(preparation: preparation, records: RecordsSpy(result: .success(saved)))
        #expect(await sut.handle(.readInput(makeJob())) == .retryInput("call", unreadable ? nil : "input"))
        #expect(await sut.handle(.load("call")) == .recovered("call", .init(stage: .pending, job: makeJob(), currentInput: unreadable ? nil : "input")))
    }
    @Test func refreshReportsTheCurrentInput() async {
        let saved = SummariesSaved(stage: .failed, job: makeJob())
        let sut = handler(preparation: PreparationSpy(currentInput: .success("changed")), records: RecordsSpy(result: .success(saved)))
        #expect(await sut.handle(.reload(["call"])) == .reloaded(["call": .init(stage: .failed, job: makeJob(), currentInput: "changed")]))
    }
    private func handler(preparation: PreparationSpy, claims: ClaimsSpy = ClaimsSpy(), records: RecordsSpy,
                         storage: StorageSpy = StorageSpy(), generation: GenerationsSpy = GenerationsSpy()) -> SummariesEffectHandler {
        .init(keeping: { true }, templates: TemplatesSpy(), preparation: preparation, claims: claims, records: records, starts: StartsSpy(), storage: storage, generation: generation)
    }
}
