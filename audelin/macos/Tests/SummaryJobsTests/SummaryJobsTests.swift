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
        #expect(effect == .diarize)
        #expect(Handoff.reduce(closed, .diarized(nil)).1 == .offer(entries, finalWrite: true, usable: true))
        #expect(Handoff.reduce(closed, .closed).1 == nil)
        #expect(Handoff.reduce(.init(), .closed).1 == .offer([], finalWrite: false, usable: false))
    }
    @Test func aSavedTranscriptIsDiarizedBeforeItIsOffered() {
        let entries = job().entries
        let saved = Handoff(latestWriteSucceeded: true, entries: entries, usable: true)
        let (diarizing, effect) = Handoff.reduce(saved, .closed)
        #expect(diarizing == Handoff(latestWriteSucceeded: true, closed: true, entries: entries, usable: true, diarizing: true))
        #expect(effect == .diarize)
        let labelled = [Job.Entry(label: "Them 1", time: "0.0", text: "hello")]
        let (offered, offer) = Handoff.reduce(diarizing, .diarized(labelled))
        #expect(offered == Handoff(latestWriteSucceeded: true, closed: true, offered: true, entries: labelled, usable: true))
        #expect(offer == .offer(labelled, finalWrite: true, usable: true))
    }
    @Test func aFailedDiarizationOffersTheEntriesAsWritten() {
        let entries = job().entries
        let diarizing = Handoff(latestWriteSucceeded: true, closed: true, entries: entries, usable: true, diarizing: true)
        let (offered, offer) = Handoff.reduce(diarizing, .diarized(nil))
        #expect(offered == Handoff(latestWriteSucceeded: true, closed: true, offered: true, entries: entries, usable: true))
        #expect(offer == .offer(entries, finalWrite: true, usable: true))
    }
    @Test(arguments: [Handoff.Event.wrote([], usable: false), .writeFailed, .closed])
    func whileDiarizingOnlyItsResultCounts(event: Handoff.Event) {
        let diarizing = Handoff(latestWriteSucceeded: true, closed: true, entries: job().entries, usable: true, diarizing: true)
        #expect(Handoff.reduce(diarizing, event) == (diarizing, nil))
    }
    @Test func aDiarizedResultWithoutAPassIsIgnored() {
        let state = Handoff(latestWriteSucceeded: true, entries: job().entries, usable: true)
        #expect(Handoff.reduce(state, .diarized([])) == (state, nil))
    }
    @Test func successPersistsBeforeRequestsAndCheckpointsBeforeNotes() async {
        let store = StoreSpy(), generation = GenerationSpy()
        let handler = EffectHandler(store: store, generation: generation, userCancelled: { _ in false })
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
        #expect(await store.released == [job])
        #expect(await store.calls == ["claim", "start", "checkpoint", "publish", "succeeded"])
    }
    @Test(arguments: ["claim", "start", "checkpoint", "publish", "succeeded"])
    func storageFailuresStopThePipeline(at failure: String) async {
        let store = StoreSpy(failure: failure), generation = GenerationSpy()
        let handler = EffectHandler(store: store, generation: generation, userCancelled: { _ in false })
        var (state, effect) = reducer.reduce(.init(), .offer(job(), enabled: true, finalWrite: true, usable: true))
        while let work = effect {
            (state, effect) = reducer.reduce(state, await handler.handle(work))
            if state.phase == .pending { (state, effect) = reducer.reduce(state, .dispatch) }
        }
        #expect(state.phase == .failed)
        #expect(await store.released == (failure == "claim" ? [] : [job()]))
        let calls = await generation.calls
        if failure == "claim" || failure == "start" { #expect(calls.isEmpty) }
        if failure == "checkpoint" { #expect(calls == ["identify"]) }
    }
    @Test func exhaustedIdentificationWarnsAndNotesFailureIsPersisted() async {
        let handler = EffectHandler(store: StoreSpy(), generation: GenerationSpy(fails: true), userCancelled: { _ in false })
        let job = job()
        let (checkpoint, effect) = reducer.reduce(.init(phase: .identifying, job: job), await handler.handle(.identify(job)))
        #expect(checkpoint.warning)
        #expect(effect == .checkpoint(job, [], warning: true))
        let (saving, save) = reducer.reduce(.init(phase: .noting, job: job, warning: true), await handler.handle(.notes(job, [])))
        #expect(saving.terminal == .failed)
        #expect(save == .save(job, .failed, warning: true))
    }
    @Test func aLiveOwnerIsObservedWithoutDispatchOrLocalInterruption() async {
        let saved = makeState(phase: .running, job: job())
        let job = job()
        let store = StoreSpy(existing: saved)
        let handler = EffectHandler(store: store, generation: GenerationSpy(), userCancelled: { _ in false })
        let event = await handler.handle(.claim(job))
        #expect(event == .claimed(owned: false, saved))
        #expect(await store.calls == ["claim"])
        let observed = assert(makeState(phase: .claiming), event) {
            $0.phase = .running; $0.job = job; $0.status = "running:false"
        }
        _ = assert(observed, .dispatch)
        _ = assert(observed, .cancel)
    }
    @Test func cancellationAndObserversCannotReplay() async {
        let job = job()
        let observed = reducer.reduce(.init(phase: .claiming), .claimed(owned: false, .init(phase: .pending, job: job))).0
        #expect(reducer.reduce(observed, .dispatch).1 == nil)
        let store = StoreSpy()
        let handler = EffectHandler(store: store, generation: GenerationSpy(fails: true), userCancelled: { _ in false })
        let exit = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return await handler.handle(.notes(job, []))
        }
        #expect(await exit.value == .cancel)
        #expect(await store.released == [job])
        #expect(await store.calls.isEmpty)
        let (cancelled, effect) = reducer.reduce(.init(phase: .noting, job: job), .cancel)
        #expect(cancelled.phase == .interrupted)
        #expect(effect == nil)
        #expect(reducer.reduce(cancelled, .noted("late")).0 == cancelled)
    }
    @Test(arguments: ["identify", "notes"], [(true, false), (true, true), (false, true)])
    func aCancelEndsAsTheUserOrTheAppMeantIt(during step: String, cancel: (user: Bool, task: Bool)) async {
        let job = job()
        let store = StoreSpy()
        let handler = EffectHandler(store: store, generation: GenerationSpy(fails: true), userCancelled: { $0 == job && cancel.user })
        let effect: Effect = step == "identify" ? .identify(job) : .notes(job, [])
        let run = Task {
            if cancel.task { withUnsafeCurrentTask { $0?.cancel() } }
            return await handler.handle(effect)
        }
        let event = await run.value
        #expect(event == (cancel.user ? .discarded : .cancel))
        #expect(await store.calls == (cancel.user ? ["discard"] : []))
        #expect(await store.released == (cancel.user ? [] : [job]))
        let phase: State.Phase = step == "identify" ? .identifying : .noting
        let (ended, next) = reducer.reduce(.init(phase: phase, job: job), event)
        #expect(ended == (cancel.user ? State(status: "idle:false") : State(phase: .interrupted, job: job, status: "interrupted:false")))
        #expect(next == nil)
        #expect(reducer.reduce(ended, .noted("late")).0 == ended)
    }
    @Test func anotherJobsCancelIsNotThisJobs() async {
        let other = { var other = job(); other.id = "other"; return other }()
        let handler = EffectHandler(store: StoreSpy(), generation: GenerationSpy(fails: true), userCancelled: { $0 == other })
        #expect(await handler.handle(.notes(job(), [])) == .notesFailed)
    }
    @Test func aFailedDiscardIsAStorageFailure() async {
        let store = StoreSpy(failure: "discard")
        let handler = EffectHandler(store: store, generation: GenerationSpy(fails: true), userCancelled: { _ in true })
        #expect(await handler.handle(.notes(job(), [])) == .storageFailed)
        #expect(await store.released == [job()])
    }
    @discardableResult private func assert(_ state: State, _ event: Event, changes: (inout State) -> Void = { _ in }) -> State {
        var expected = state; changes(&expected)
        let (result, effect) = reducer.reduce(state, event)
        #expect(result == expected)
        #expect(effect == nil)
        return result
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
    let existing: State?
    init(failure: String? = nil, existing: State? = nil) { self.failure = failure; self.existing = existing }
    func call(_ name: String) throws { calls.append(name); if name == failure { throw StubError() } }
    func claim(_ job: Job) throws -> (owned: Bool, state: State) {
        try call("claim")
        if let existing { return (false, existing) }
        return (true, .init(phase: .pending, job: job))
    }
    var released: [Job] = []
    func release(_ job: Job) { released.append(job) }
    func start(_ job: Job) throws -> Bool { try call("start"); return true }
    func checkpoint(_ job: Job, identities: [Identity], warning: Bool) throws { try call("checkpoint") }
    func publish(_ job: Job, notes: String, warning: Bool) throws { try call("publish") }
    func save(_ job: Job, phase: State.Phase, warning: Bool) throws { try call(phase.rawValue) }
    func discard(_ job: Job) throws { try call("discard") }
}
private actor GenerationSpy: Generation {
    var calls: [String] = []
    let fails: Bool
    init(fails: Bool = false) { self.fails = fails }
    func identify(_ job: Job) throws -> [Identity] { calls.append("identify"); if fails { throw StubError() }; return [] }
    func notes(_ job: Job, identities: [Identity]) throws -> String { calls.append("notes"); if fails { throw StubError() }; return "notes" }
}

private func makeState(phase: State.Phase, job: Job? = nil) -> State { .init(phase: phase, job: job) }
