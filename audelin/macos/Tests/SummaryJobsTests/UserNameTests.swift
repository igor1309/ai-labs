import SummaryJobs
import Testing

@Suite struct UserNameTests {
    let format = FormatSpy()
    private var reducer: SummariesReducer { .init(format: format.call, badge: { _ in .pending }) }

    @Test(arguments: [nil, "Игорь"]) func preparationCapturesTheName(userName: String?) {
        let state = makeState(calls: ["call": .init(stage: .choosing, requestedTemplate: "Daily", job: makeJob(), requested: true)])
        var job = makeJob(); job.userName = userName
        assert(state, .keepingRead("call", true, userName: userName), delivers: .selectTemplate(job, "Daily")) {
            $0.calls["call"]?.job = job; $0.calls["call"]?.stage = .selecting
            $0.calls["call"]?.status = "selecting:false"; $0.calls["call"]?.badge = .pending
        }
    }
    @Test(arguments: [nil, "Игорь"]) func preparationReadsTheCurrentName(userName: String?) async {
        let handler = SummariesEffectHandler(keeping: { true }, userName: { userName }, templates: TemplatesSpy(), preparation: PreparationSpy(),
                                             claims: ClaimsSpy(), records: RecordsSpy(), starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy())
        #expect(await handler.handle(.readKeeping(makeJob())) == .keepingRead("call", true, userName: userName))
    }
    @Test func aLaterNameDoesNotReachAPreparedRun() {
        var job = makeJob(); job.userName = "Игорь"
        let state = makeState(calls: ["call": .init(stage: .selecting, requestedTemplate: "Daily", job: job, requested: true)])
        assert(state, .keepingRead("call", true, userName: "Igor M"), delivers: nil)
    }
    @Test func recoveryKeepsTheSavedName() {
        var job = makeJob(); job.speakers = false; job.template = makeTemplate().jobTemplate; job.userName = "Игорь"
        let state = makeState(calls: ["call": .init(stage: .recovering)])
        assert(state, .recovered("call", .init(stage: .pending, job: job, currentInput: job.input)), delivers: .start(job)) {
            $0.calls["call"] = .init(stage: .starting, requestedTemplate: "Daily", template: makeTemplate(), job: job, status: "starting:false", badge: .pending)
        }
    }

    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        _ mutation: (inout SummariesState) -> Void = { _ in }, sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; mutation(&expected)
        let result = reducer.reduce(state, event)
        #expect(result.0 == expected, sourceLocation: sourceLocation)
        #expect(result.1 == effect, sourceLocation: sourceLocation)
    }
}
