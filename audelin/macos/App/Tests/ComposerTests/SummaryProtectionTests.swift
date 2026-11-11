import Foundation
import SummaryJobs
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct SummaryProtectionTests {
    @Test(arguments: [State.Phase.claiming, .running, .starting, .identifying, .checkpointing, .noting, .publishing, .saving])
    func everyActivePhaseBlocksUpdate(phase: State.Phase) {
        let model = SummaryJobModel(initial: .init(phase: phase), handler: handler(), changed: { _ in })
        #expect(model.busy)
    }

    @Test(arguments: [State.Phase.idle, .waiting, .pending, .observed, .succeeded, .failed, .interrupted, .unavailable])
    func inactivePhasesAllowUpdate(phase: State.Phase) {
        let model = SummaryJobModel(initial: .init(phase: phase), handler: handler(), changed: { _ in })
        #expect(!model.busy)
    }

    @Test func dispatchReservesTheJobBeforeItsAsynchronousReductionAndReleasesAfterSave() async {
        let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved", program: "", endpoint: "http://127.0.0.1", credentialVariable: "")
        let job = Job(id: "attempt", call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: false, primary: runtime)
        let store = ProtectionStore(), states = AsyncStream<State>.makeStream()
        let model = SummaryJobModel(initial: .init(phase: .pending, job: job), handler: handler(store: store), changed: { states.continuation.yield($0) })
        model.send(.dispatch)
        #expect(model.busy)
        await store.saving.next()
        #expect(model.state.phase == .saving && model.busy)
        store.finish.send()
        for await state in states.stream where state.phase == .succeeded { break }
        #expect(!model.busy)
        await model.cancelAndJoin()
    }

    private func handler(store: ProtectionStore = ProtectionStore()) -> EffectHandler {
        .init(store: store, generation: ProtectionGeneration(), cancelled: { false })
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
    func release(_ job: Job) async {}
}
