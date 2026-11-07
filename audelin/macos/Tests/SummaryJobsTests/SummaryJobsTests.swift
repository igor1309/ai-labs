import SummaryJobs
import Testing

@Suite struct SummaryJobsTests {
    let reducer = Reducer(format: { "\($0):\($1)" })
    @Test(arguments: [(false, true, true), (true, false, true), (true, true, false)])
    func ineligibleNeverClaims(enabled: Bool, finalWrite: Bool, usable: Bool) {
        let (state, effect) = reducer.reduce(.init(), .offer(job(), enabled: enabled, finalWrite: finalWrite, usable: usable))
        #expect(effect == nil)
        #expect(state.phase == (enabled ? .unavailable : .idle))
    }
    @Test func latestWriteAndCloseDecideEligibility() {
        let entries = job().entries
        var state = Handoff.reduce(.init(), .wrote(entries, usable: true)).0
        state = Handoff.reduce(state, .writeFailed).0
        #expect(Handoff.reduce(state, .closed).1 == .offer(entries, finalWrite: false, usable: true))
        state = Handoff.reduce(state, .wrote(entries, usable: true)).0
        let (closed, effect) = Handoff.reduce(state, .closed)
        #expect(effect == .offer(entries, finalWrite: true, usable: true))
        #expect(Handoff.reduce(closed, .closed).1 == nil)
        #expect(Handoff.reduce(.init(), .closed).1 == .offer([], finalWrite: false, usable: false))
    }
    @Test func successPersistsBeforeRequestsAndCheckpointsBeforeNotes() async {
        let store = StoreSpy(), generation = GenerationSpy()
        let handler = EffectHandler(store: store, generation: generation, cancelled: { false })
        let job = job()
        var state = State()
        func send(_ event: Event) -> Effect? {
            let result = reducer.reduce(state, event); state = result.0; return result.1
        }
        #expect(send(.offer(job, enabled: true, finalWrite: true, usable: true)) == .claim(job))
        #expect(send(await handler.handle(.claim(job))) == nil)
        #expect(state.phase == .pending)
        #expect(send(.dispatch) == .start(job))
        #expect(send(await handler.handle(.start(job))) == .identify(job))
        let identified = await handler.handle(.identify(job))
        #expect(send(identified) == .checkpoint(job, [], warning: false))
        #expect(await generation.calls == ["identify"])
        #expect(send(await handler.handle(.checkpoint(job, [], warning: false))) == .notes(job, []))
        #expect(send(await handler.handle(.notes(job, []))) == .publish(job, "notes", warning: false))
        #expect(send(await handler.handle(.publish(job, "notes", warning: false))) == .save(job, .succeeded, warning: false))
        #expect(send(await handler.handle(.save(job, .succeeded, warning: false))) == nil)
        #expect(state.phase == .succeeded)
        #expect(await store.calls == ["claim", "start", "checkpoint", "publish", "succeeded"])
    }
    @Test(arguments: ["claim", "start", "checkpoint", "publish", "succeeded"])
    func storageFailuresStopThePipeline(at failure: String) async {
        let store = StoreSpy(failure: failure), generation = GenerationSpy()
        let handler = EffectHandler(store: store, generation: generation, cancelled: { false })
        var (state, effect) = reducer.reduce(.init(), .offer(job(), enabled: true, finalWrite: true, usable: true))
        while let work = effect {
            (state, effect) = reducer.reduce(state, await handler.handle(work))
            if state.phase == .pending { (state, effect) = reducer.reduce(state, .dispatch) }
        }
        #expect(state.phase == .failed)
        let calls = await generation.calls
        if failure == "claim" || failure == "start" { #expect(calls.isEmpty) }
        if failure == "checkpoint" { #expect(calls == ["identify"]) }
    }
    @Test func exhaustedIdentificationWarnsAndNotesFailureIsPersisted() async {
        let handler = EffectHandler(store: StoreSpy(), generation: GenerationSpy(fails: true), cancelled: { false })
        let job = job()
        let (checkpoint, effect) = reducer.reduce(.init(phase: .identifying, job: job), await handler.handle(.identify(job)))
        #expect(checkpoint.warning)
        #expect(effect == .checkpoint(job, [], warning: true))
        let (saving, save) = reducer.reduce(.init(phase: .noting, job: job, warning: true), await handler.handle(.notes(job, [])))
        #expect(saving.terminal == .failed)
        #expect(save == .save(job, .failed, warning: true))
    }
    @Test func cancellationAndObserversCannotReplay() async {
        let job = job()
        let observed = reducer.reduce(.init(phase: .claiming), .claimed(owned: false, .init(phase: .pending, job: job))).0
        #expect(reducer.reduce(observed, .dispatch).1 == nil)
        let handler = EffectHandler(store: StoreSpy(), generation: GenerationSpy(fails: true), cancelled: { true })
        #expect(await handler.handle(.notes(job, [])) == .cancel)
        let (cancelled, effect) = reducer.reduce(.init(phase: .noting, job: job), .cancel)
        #expect(cancelled.phase == .interrupted)
        #expect(effect == nil)
        #expect(reducer.reduce(cancelled, .noted("late")).0 == cancelled)
    }
}
private func job() -> Job {
    let runtime = Job.Runtime(kind: "compatibleAPI", model: "fixture", program: "", endpoint: "http://127.0.0.1", credentialVariable: "")
    return .init(id: "job", call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "Hello")], speakers: true, primary: runtime, fallback: runtime)
}
private struct StubError: Error {}
private actor StoreSpy: Store {
    var calls: [String] = []
    let failure: String?
    init(failure: String? = nil) { self.failure = failure }
    func call(_ name: String) throws { calls.append(name); if name == failure { throw StubError() } }
    func claim(_ job: Job) throws -> (owned: Bool, state: State) { try call("claim"); return (true, .init(phase: .pending, job: job)) }
    func start(_ job: Job) throws -> Bool { try call("start"); return true }
    func checkpoint(_ job: Job, identities: [Identity], warning: Bool) throws { try call("checkpoint") }
    func publish(_ job: Job, notes: String, warning: Bool) throws { try call("publish") }
    func save(_ job: Job, phase: State.Phase, warning: Bool) throws { try call(phase.rawValue) }
}
private actor GenerationSpy: Generation {
    var calls: [String] = []
    let fails: Bool
    init(fails: Bool = false) { self.fails = fails }
    func identify(_ job: Job) throws -> [Identity] { calls.append("identify"); if fails { throw StubError() }; return [] }
    func notes(_ job: Job, identities: [Identity]) throws -> String { calls.append("notes"); if fails { throw StubError() }; return "notes" }
}
