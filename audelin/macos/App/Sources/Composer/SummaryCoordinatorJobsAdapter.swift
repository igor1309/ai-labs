import Foundation
import Preferences
import SummaryFiles
import SummaryJobs

/// Builds independent job models and translates their storage and lifecycle outcomes.
@MainActor final class SummaryCoordinatorJobsAdapter: SummaryCoordinatorJobs {
    private let load: @Sendable (String) async throws -> SummaryFiles.Record?
    private let store: SummaryJobStore
    private let handler: SummaryJobs.EffectHandler
    private let preferences: PreferencesStore
    private let changed: (String, String) -> Void
    private var models: [String: SummaryJobModel] = [:]
    init(load: @escaping @Sendable (String) async throws -> SummaryFiles.Record?, store: SummaryJobStore,
         handler: SummaryJobs.EffectHandler, preferences: PreferencesStore, changed: @escaping (String, String) -> Void) {
        self.load = load; self.store = store; self.handler = handler; self.preferences = preferences; self.changed = changed
    }
    func recover(call: String) async throws -> SummaryRecovery {
        guard let record = try await load(call) else { return .absent }
        let state = try store.state(record)
        _ = install(state, call: call)
        return state.phase == .pending ? .pending : .installed
    }
    func submit(_ submission: SummarySubmission) async -> Bool {
        let config = preferences.read().notes
        func runtime(_ value: NotesPreferences.Runtime) -> Job.Runtime {
            .init(kind: value.kind, model: value.model, program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
        }
        let job = Job(id: UUID().uuidString, call: submission.call, input: submission.input,
                      entries: submission.entries.map { .init(label: $0.label, time: $0.time, text: $0.text) },
                      speakers: config.speakers, primary: runtime(config.primary), fallback: config.fallback.map(runtime))
        let model = install(.init(), call: submission.call)
        guard config.enabled else { return false }
        model.send(.offer(job, enabled: config.enabled, finalWrite: submission.finalWrite, usable: submission.usable))
        await model.waitForClaim()
        return model.state.phase == .pending
    }
    func dispatch(call: String) { models[call]?.send(.dispatch) }
    func recoveryFailed(call: String) async {
        let model = install(.init(), call: call)
        model.send(.storageFailed)
        await model.waitForClaim()
    }
    func join() async { for model in Array(models.values) { await model.cancelAndJoin() } }
    private func install(_ state: SummaryJobs.State, call: String) -> SummaryJobModel {
        let model = SummaryJobModel(initial: state, handler: handler, changed: { [changed] in changed(call, $0.status) })
        models[call] = model; changed(call, state.status)
        return model
    }
}
