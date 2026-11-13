import Foundation
import SummaryJobs
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct SummaryProtectionTests {
    @Test(arguments: [State.Phase.claiming, .running, .observed, .starting, .identifying, .checkpointing, .noting, .publishing, .saving])
    func everyActivePhaseBlocksUpdate(phase: State.Phase) {
        let model = SummaryJobModel(initial: .init(phase: phase), observesOwner: false, canDispatch: { true }, handler: handler(store: ProtectionStore()), format: { _, _ in "" }, changed: { _ in })
        #expect(model.busy)
    }

    @Test(arguments: [State.Phase.idle, .waiting, .pending, .succeeded, .failed, .interrupted, .unavailable])
    func inactivePhasesAllowUpdate(phase: State.Phase) {
        let model = SummaryJobModel(initial: .init(phase: phase), observesOwner: false, canDispatch: { true }, handler: handler(store: ProtectionStore()), format: { _, _ in "" }, changed: { _ in })
        #expect(!model.busy)
    }

    @Test func dispatchedJobStaysProtectedThroughTerminalSave() async {
        let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved", program: "", endpoint: "http://127.0.0.1", credentialVariable: "")
        let job = Job(id: "attempt", call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: false, primary: runtime)
        let store = ProtectionStore(), states = AsyncStream<State>.makeStream()
        let model = SummaryJobModel(initial: .init(phase: .pending, job: job), observesOwner: false, canDispatch: { true }, handler: handler(store: store), format: { _, _ in "" }, changed: { states.continuation.yield($0) })
        await model.dispatch()
        #expect(model.busy)
        await store.saving.next()
        #expect(model.state.phase == .saving && model.busy)
        store.finish.send()
        for await state in states.stream where state.phase == .succeeded { break }
        #expect(!model.busy)
        await model.cancelAndJoin()
    }

    @Test func coordinatorProtectsTheAsynchronousDispatchHandoff() async {
        let jobs = HeldHandoff()
        let coordinator = SummaryCoordinatorModel(jobs: jobs)
        coordinator.send(.recover("call"))
        #expect(coordinator.busy)
        await jobs.started.next()
        #expect(coordinator.busy)
        jobs.finish.send()
        await coordinator.wait(call: "call")
        #expect(!coordinator.busy)
        await coordinator.shutdown()
    }

    @Test func withdrawnDispatchCannotStartAfterStopDispatch() async {
        var allowed = true
        let reduced = Signal()
        let model = SummaryJobModel(initial: .init(phase: .pending), observesOwner: false,
                                    canDispatch: { allowed }, handler: handler(store: ProtectionStore()), format: { _, _ in "" }, changed: { _ in reduced.send() })
        model.send(.dispatch)
        allowed = false
        await reduced.next()
        #expect(model.state.phase == .pending)
        #expect(!model.busy)
        await model.cancelAndJoin()
    }

    private func handler(store: ProtectionStore) -> EffectHandler {
        .init(store: store, generation: ProtectionGeneration(), userCancelled: { _ in false })
    }
}

private struct ProtectionGeneration: Generation {
    func identify(_ job: Job) async throws -> [Identity] { [] }
    func notes(_ job: Job, identities: [Identity]) async throws -> String { "saved notes" }
}
private struct ProtectionStore: Store {
    let saving = Signal(), finish = Signal()
    func claim(_ job: Job) async throws -> (owned: Bool, state: State) { (true, .init(phase: .pending, job: job)) }
    func start(_ job: Job) async throws -> Bool { true }
    func checkpoint(_ job: Job, identities: [Identity], warning: Bool) async throws {}
    func publish(_ job: Job, notes: String, warning: Bool) async throws {}
    func save(_ job: Job, phase: State.Phase, warning: Bool) async throws { saving.send(); await finish.next() }
    func discard(_ job: Job) async {}
    func release(_ job: Job) async {}
}

private struct HeldHandoff: SummaryCoordinatorJobs {
    let started = Signal(), finish = Signal()
    func recover(call: String) async throws -> SummaryRecovery { .pending }
    func submit(_ submission: SummarySubmission) async -> Bool { Issue.record("unexpected submission"); return false }
    func retry(call: String) async throws { Issue.record("unexpected retry") }
    func dispatch(call: String) async { started.send(); await finish.next() }
    func recoveryFailed(call: String) async { Issue.record("unexpected recovery failure") }
    func join() async {}
}
