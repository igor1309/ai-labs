import SummaryJobs
import Synchronization
import Testing

struct Template: Equatable, Sendable { let marker: Int }
func makeTemplate() -> Template { .init(marker: 17) }
final class TemplatesSpy: SummariesTemplates {
    private let recorded = Mutex(0)
    let template: Template
    init(template: Template = makeTemplate()) { self.template = template }
    var calls: Int { recorded.withLock { $0 } }
    func resolveDefault() async -> Template { recorded.withLock { $0 += 1 }; return template }
}
typealias SummariesState = SummaryJobs.SummariesState<Template>
typealias SummariesEvent = SummaryJobs.SummariesEvent<Template>
typealias SummariesEffect = SummaryJobs.SummariesEffect<Template>
typealias SummariesReducer = SummaryJobs.SummariesReducer<Template>
typealias SummariesEffectHandler = SummaryJobs.SummariesEffectHandler<Template>

@Suite struct TemplateResolutionTests {
    let format = FormatSpy()
    func assert(_ state: SummariesState, _ event: SummariesEvent, _ mutation: (inout SummariesState) -> Void = { _ in }) {
        var expected = state; mutation(&expected)
        #expect(SummariesReducer(format: format.call, badge: { _ in .pending }).reduce(state, event).0 == expected)
    }
    @Test func resolutionStoresTheTemplate() {
        let state = makeState(calls: ["call": .init(stage: .resolving, job: makeJob(), identities: [makeIdentity()], badge: .pending)])
        assert(state, .resolved("call", makeTemplate())) {
            $0.calls["call"]?.stage = .noting; $0.calls["call"]?.status = "noting:false"; $0.calls["call"]?.template = makeTemplate()
        }
    }
    @Test func resolutionDeliversNotesWithTheTemplateAndEvidence() {
        let state = makeState(calls: ["call": .init(stage: .resolving, job: makeJob(), identities: [makeIdentity()])])
        let reducer = SummariesReducer(format: format.call, badge: { _ in .pending })
        #expect(reducer.reduce(state, .resolved("call", makeTemplate())).1 == .notes(makeJob(), [makeIdentity()], makeTemplate()))
    }
    @Test func everyResolutionAsksForDefaultAfresh() async {
        let templates = TemplatesSpy()
        let handler = SummariesEffectHandler(templates: templates, preparation: PreparationSpy(), claims: ClaimsSpy(),
            records: RecordsSpy(), starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy())
        #expect(await handler.handle(.resolve(makeJob())) == .resolved("call", makeTemplate()))
        #expect(await handler.handle(.resolve(makeJob())) == .resolved("call", makeTemplate()))
        #expect(templates.calls == 2)
    }
    @Test func shutdownWaitsForResolutionAndReleasesItsJob() {
        let state = makeState(calls: ["call": .init(stage: .resolving, job: makeJob())])
        let reducer = SummariesReducer(format: format.call, badge: { _ in .pending })
        var expected = state
        expected.lifecycle = .draining; expected.dispatch = false; expected.releasing = true
        #expect(reducer.reduce(state, .shutdown).0 == expected)
        #expect(reducer.reduce(state, .shutdown).1 == .release([makeJob()]))
    }
    @Test func resolutionDuringShutdownEndsWithoutGenerating() {
        let state = makeState(lifecycle: .draining, dispatch: false,
                              calls: ["call": .init(stage: .resolving, job: makeJob())])
        var expected = state
        expected.calls["call"]?.stage = .interrupted; expected.calls["call"]?.status = "interrupted:false"
        expected.calls["call"]?.badge = .pending; expected.calls["call"]?.retryable = true; expected.lifecycle = .settled
        let reducer = SummariesReducer(format: format.call, badge: { _ in .pending })
        #expect(reducer.reduce(state, .resolved("call", makeTemplate())).0 == expected)
        #expect(reducer.reduce(state, .resolved("call", makeTemplate())).1 == nil)
    }
    @Test func aReleaseStillWaitsForTheTemplateAnswer() {
        var state = makeState(lifecycle: .draining, dispatch: false, calls: ["call": .init(stage: .resolving, job: makeJob())])
        state.releasing = true
        var expected = state; expected.releasing = false
        let reducer = SummariesReducer(format: format.call, badge: { _ in .pending })
        #expect(reducer.reduce(state, .released).0 == expected)
        #expect(reducer.reduce(state, .released).1 == nil)
    }
}
