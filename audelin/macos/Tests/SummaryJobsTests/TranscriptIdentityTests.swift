import SummaryJobs
import Testing

@Suite(.timeLimit(.minutes(1))) struct TranscriptIdentityTests {
    let format = FormatSpy()
    let badge = BadgeSpy(stub: .pending)
    @Test(arguments: [nil, SummariesStage.waiting, .recovering, .discarding])
    func finalizedSubmissionKeepsTheSuppliedIdentity(stage: SummariesStage?) {
        let state = makeState(calls: stage.map { ["call": .init(stage: $0)] } ?? [:])
        let submission = SummariesSubmission(call: "call", entries: makeEntries(), finalWrite: true, usable: true,
                                              transcriptIdentity: "opaque:submitted")
        assert(state, finalized) {
            if stage == .recovering || stage == .discarding {
                $0.calls["call"]?.submission = submission
            } else {
                $0.calls["call"] = .init(stage: .preparing, submission: submission, status: "preparing:false", badge: .pending)
            }
        }
        let preparing = stage != .recovering && stage != .discarding
        #expect(format.payloads == (preparing ? [.init(stage: .preparing, warning: false)] : []))
        #expect(badge.payloads == (preparing ? [.preparing] : []))
    }

    @Test(arguments: [nil, SummariesStage.waiting, .recovering, .discarding])
    func finalizedSubmissionDeliversItsIdentityToPreparation(stage: SummariesStage?) {
        let state = makeState(calls: stage.map { ["call": .init(stage: $0)] } ?? [:])
        let submission = SummariesSubmission(call: "call", entries: makeEntries(), finalWrite: true, usable: true,
                                              transcriptIdentity: "opaque:submitted")
        let expected: SummariesEffect? = stage == .recovering || stage == .discarding ? nil : .prepare(submission)
        #expect(reducer.reduce(state, finalized).1 == expected)
    }

    @Test func replacingAStaleClaimKeepsThePreparedTranscriptIdentity() {
        var prepared = makeJob(); prepared.input = "new-input"; prepared.transcriptIdentity = "opaque:prepared"
        let state = makeState(calls: ["call": .init(stage: .claiming, job: prepared)])
        let event = SummariesEvent.claimed("call", owned: false, .init(stage: .pending, job: makeJob()))
        assert(state, event) {
            $0.calls["call"] = .init(stage: .discarding, job: makeJob(), replacement: .automatic,
                submission: .init(call: "call", entries: prepared.entries, finalWrite: true, usable: true, transcriptIdentity: "opaque:prepared"),
                status: "discarding:false", badge: .pending)
        }
        #expect(format.payloads == [.init(stage: .discarding, warning: false)])
        #expect(badge.payloads == [.discarding])
    }

    @Test func replacingAStaleClaimDiscardsOnlyTheStoredJob() {
        var prepared = makeJob(); prepared.input = "new-input"; prepared.transcriptIdentity = "opaque:prepared"
        let state = makeState(calls: ["call": .init(stage: .claiming, job: prepared)])
        #expect(reducer.reduce(state, .claimed("call", owned: false, .init(stage: .pending, job: makeJob()))).1 == .discard(makeJob()))
    }

    @Test(arguments: [SummariesStage.pending, .interrupted])
    func resumedRunPublishesTheSavedTranscriptIdentity(stage: SummariesStage) async {
        var job = makeJob(); job.speakers = false; job.template = makeTemplate().jobTemplate
        job.transcriptIdentity = "opaque:saved-transcript"
        let saved = SummariesSaved(stage: stage, job: job)
        let records = RecordsSpy(result: .success(saved), retried: .success(.init(stage: .pending, job: job)))
        let preparation = PreparationSpy(), storage = StorageSpy(), generation = GenerationsSpy()
        let handler = SummariesEffectHandler(keeping: { true }, templates: TemplatesSpy(), preparation: preparation,
            claims: ClaimsSpy(), records: records, starts: StartsSpy(), storage: storage, generation: generation)
        var state = makeState()
        var event = SummariesEvent.recover("call")
        while true {
            let (next, effect) = reducer.reduce(state, event); state = next
            if let effect { event = await handler.handle(effect) }
            else if state.calls["call"]?.stage == .interrupted { event = .retry("call") }
            else { break }
        }
        #expect(state.calls["call"]?.stage == .succeeded)
        #expect(generation.payloads == [.notes(job, [], makeTemplate())])
        #expect(storage.payloads.contains(.publish(job, "notes", false, .rotation)))
        #expect(preparation.payloads.isEmpty)
    }

    private var reducer: SummariesReducer { .init(format: format.call, badge: badge.call) }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(reducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }

    private var finalized: SummariesEvent {
        .finalized("call", entries: makeEntries(), finalWrite: true, usable: true, notesOn: true, transcriptIdentity: "opaque:submitted")
    }
}
