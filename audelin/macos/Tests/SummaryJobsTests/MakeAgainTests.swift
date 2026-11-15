import SummaryJobs
import Synchronization
import Testing

@Suite struct MakeAgainTests {
    let format = FormatSpy()
    private var reducer: SummariesReducer { .init(format: format.call, badge: { _ in .pending }) }

    @Test(arguments: [nil, SummariesStage.succeeded, .failed, .interrupted])
    func chosenTemplateStartsANewRun(stage: SummariesStage?) {
        let state = makeState(calls: stage.map { ["call": .init(stage: $0)] } ?? [:])
        assert(state, .generate("call", template: "Daily"), delivers: .read("call")) {
            $0.calls["call"] = .init(stage: .reading, requestedTemplate: "Daily", requested: true, status: "reading:false", badge: .pending)
        }
    }

    @Test(arguments: [SummariesStage.reading, .preparing, .choosing, .selecting, .claiming, .pending, .starting,
                      .identifying, .checkpointing, .resolving, .noting, .deferred, .publishing, .saving, .retrying, .discarding, .observed])
    func anotherRequestCannotOverlap(stage: SummariesStage) {
        let state = makeState(calls: ["call": .init(stage: stage)])
        assert(state, .generate("call", template: "Other"), delivers: nil)
    }

    @Test func transcriptReadKeepsTheChosenTemplate() {
        let state = makeState(calls: ["call": .init(stage: .reading, requestedTemplate: "Daily", requested: true)])
        let submission = makeSubmission(requested: true)
        assert(state, .submit(submission), delivers: .prepare(submission)) {
            $0.calls["call"] = .init(stage: .preparing, requestedTemplate: "Daily", requested: true,
                                     submission: submission, status: "preparing:false", badge: .pending)
        }
    }

    @Test(arguments: [true, false]) func preparationCapturesKeeping(keeping: Bool) {
        let state = makeState(calls: ["call": .init(stage: .choosing, requestedTemplate: "Daily", job: makeJob(), requested: true)])
        var job = makeJob(); job.keepPrevious = keeping
        assert(state, .keepingRead("call", keeping), delivers: .selectTemplate(job, "Daily")) {
            $0.calls["call"]?.job = job; $0.calls["call"]?.stage = .selecting
            $0.calls["call"]?.status = "selecting:false"; $0.calls["call"]?.badge = .pending
        }
    }

    @Test func selectedContentIsCapturedBeforeTheClaim() {
        let state = makeState(calls: ["call": .init(stage: .selecting, requestedTemplate: "Daily", job: makeJob(), requested: true)])
        var job = makeJob(); job.template = makeTemplate().jobTemplate; job.requested = true
        assert(state, .templateSelected("call", makeTemplate()), delivers: .claim(job)) {
            $0.calls["call"]?.job = job; $0.calls["call"]?.template = makeTemplate(); $0.calls["call"]?.stage = .claiming
            $0.calls["call"]?.status = "claiming:false"; $0.calls["call"]?.badge = .pending
        }
    }

    @Test func automaticPreparationSelectsDefault() {
        let state = makeState(calls: ["call": .init(stage: .choosing, job: makeJob())])
        assert(state, .keepingRead("call", true), delivers: .selectTemplate(makeJob(), "Default")) {
            $0.calls["call"]?.stage = .selecting; $0.calls["call"]?.status = "selecting:false"; $0.calls["call"]?.badge = .pending
        }
    }

    @Test(arguments: [true, false]) func publicationUsesOnlyTheCapturedChoice(keeping: Bool) {
        var job = makeJob(); job.keepPrevious = keeping; job.template = makeTemplate().jobTemplate
        let state = makeState(calls: ["call": .init(stage: .noting, template: makeTemplate(), job: job)])
        assert(state, .noted("call", "new notes"), delivers: .publish(job, "new notes", warning: false, keeping: keeping ? .rotation : .replacement)) {
            $0.calls["call"]?.stage = .publishing; $0.calls["call"]?.notes = "new notes"
            $0.calls["call"]?.status = "publishing:false"; $0.calls["call"]?.badge = .pending
        }
        // Only the choice read while preparing is an event; later preferences cannot alter this job.
        assert(state, .keepingRead("call", !keeping), delivers: nil)
    }

    @Test func aMissingTemplateFailsBeforeAnyClaim() {
        let state = makeState(calls: ["call": .init(stage: .selecting, requestedTemplate: "Missing", job: makeJob(), requested: true)])
        assert(state, .templateFailed("call", "Missing: unavailable"), delivers: nil) {
            $0.calls["call"]?.stage = .failed; $0.calls["call"]?.job = nil; $0.calls["call"]?.failure = "Missing: unavailable"
            $0.calls["call"]?.status = "failed:false"; $0.calls["call"]?.badge = .pending; $0.calls["call"]?.retryable = true
        }
    }

    @Test func retryingAnUnresolvedTemplateKeepsItsSelection() {
        let state = makeState(calls: ["call": .init(stage: .failed, requestedTemplate: "Missing", requested: true, retryable: true)])
        assert(state, .retry("call"), delivers: .read("call")) {
            $0.calls["call"] = .init(stage: .reading, requestedTemplate: "Missing", requested: true, status: "reading:false", badge: .pending)
        }
    }

    @Test func recoveryUsesTheSavedTemplateWithoutResolution() {
        var job = makeJob(); job.speakers = false; job.template = makeTemplate().jobTemplate; job.keepPrevious = false
        let state = makeState(calls: ["call": .init(stage: .recovering)])
        assert(state, .recovered("call", .init(stage: .pending, job: job)), delivers: .start(job)) {
            $0.calls["call"] = .init(stage: .starting, requestedTemplate: "Daily", template: makeTemplate(), job: job, status: "starting:false", badge: .pending)
        }
        let starting = makeState(calls: ["call": .init(stage: .starting, template: makeTemplate(), job: job)])
        assert(starting, .started("call", owned: true), delivers: .notes(job, [], makeTemplate())) {
            $0.calls["call"]?.stage = .noting; $0.calls["call"]?.status = "noting:false"; $0.calls["call"]?.badge = .pending
        }
    }

    @Test(arguments: [SummariesStage.reading, .preparing, .choosing, .selecting])
    func cancellationWaitsForPreparationWithoutClaiming(stage: SummariesStage) {
        let state = makeState(calls: ["call": .init(stage: stage, job: makeJob(), requested: true)])
        assert(state, .cancel("call"), delivers: nil) { $0.calls["call"]?.cancelling = true }
        var cancelled = state; cancelled.calls["call"]?.cancelling = true
        let answer: SummariesEvent
        switch stage {
        case .reading: answer = .submit(makeSubmission(requested: true))
        case .preparing: answer = .prepared("call", makeJob(), notesOn: true)
        case .choosing: answer = .keepingRead("call", false)
        default: answer = .templateSelected("call", makeTemplate())
        }
        assert(cancelled, answer, delivers: nil) { $0.calls["call"] = nil }
    }

    @Test func shutdownFinishesCapturingAnAcceptedAutomaticJob() {
        let state = makeState(lifecycle: .draining, dispatch: false, calls: ["call": .init(stage: .choosing, job: makeJob())])
        let selected = reducer.reduce(state, .keepingRead("call", true))
        #expect(selected.0.lifecycle == .draining && selected.1 == .selectTemplate(makeJob(), "Default"))
        let captured = reducer.reduce(selected.0, .templateSelected("call", makeTemplate()))
        var job = makeJob(); job.template = makeTemplate().jobTemplate
        #expect(captured.0.lifecycle == .draining && captured.1 == .claim(job))
        assert(captured.0, .claimed("call", owned: true, .init(stage: .pending, job: job)), delivers: nil) {
            $0.lifecycle = .settled
            $0.calls["call"] = .init(stage: .pending, requestedTemplate: "Daily", template: makeTemplate(), job: job,
                                     status: "pending:false", badge: .pending)
        }
    }

    @Test(arguments: [true, false]) func keepReadDeliversTheCurrentPreference(keeping: Bool) async {
        let handler = handler(keeping: { keeping })
        #expect(await handler.handle(.readKeeping(makeJob())) == .keepingRead("call", keeping))
    }

    @Test(arguments: [SummariesKeeping.rotation, .replacement])
    func publicationEffectDispatchesTheSelectedPolicy(keeping: SummariesKeeping) async {
        let storage = StorageSpy()
        let handler = SummariesEffectHandler(keeping: { true }, templates: TemplatesSpy(), preparation: PreparationSpy(),
            claims: ClaimsSpy(), records: RecordsSpy(), starts: StartsSpy(), storage: storage, generation: GenerationsSpy())
        #expect(await handler.handle(.publish(makeJob(), "candidate", warning: false, keeping: keeping)) == .published("call"))
        #expect(storage.payloads == [.publish(makeJob(), "candidate", false, keeping)])
    }

    @Test func selectionDeliversTheRequestedTemplateOrItsFailure() async {
        let templates = ChosenTemplatesSpy(result: .success(makeTemplate()))
        #expect(await handler(templates: templates).handle(.selectTemplate(makeJob(), "Daily")) == .templateSelected("call", makeTemplate()))
        #expect(templates.names == ["Daily"])
        let missing = ChosenTemplatesSpy(result: .failure(.init()))
        guard case .templateFailed("call", _) = await handler(templates: missing).handle(.selectTemplate(makeJob(), "Missing")) else {
            Issue.record("missing template must fail"); return
        }
        #expect(missing.names == ["Missing"])
    }

    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        _ mutation: (inout SummariesState) -> Void = { _ in }, sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; mutation(&expected)
        let result = reducer.reduce(state, event)
        #expect(result.0 == expected, sourceLocation: sourceLocation)
        #expect(result.1 == effect, sourceLocation: sourceLocation)
    }
    private func handler(keeping: @escaping @Sendable () async -> Bool = { true },
                         templates: ChosenTemplatesSpy = .init(result: .success(makeTemplate()))) -> SummariesEffectHandler {
        .init(keeping: keeping, templates: templates, preparation: PreparationSpy(), claims: ClaimsSpy(), records: RecordsSpy(),
              starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy())
    }
}

private final class ChosenTemplatesSpy: SummariesTemplates {
    private let recorded = Mutex<[String]>([])
    let result: Result<Template, SpyFailure>
    init(result: Result<Template, SpyFailure>) { self.result = result }
    var names: [String] { recorded.withLock { $0 } }
    func resolveDefault() async -> Template { Issue.record("unexpected Default resolution"); return makeTemplate() }
    func resolve(_ name: String) async throws -> Template {
        recorded.withLock { $0.append(name) }
        return try result.get()
    }
}
