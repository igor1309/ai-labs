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
    private let canDispatch: () -> Bool
    private let changed: (String, SummaryJobs.State) -> Void
    private var models: [String: SummaryJobModel] = [:]
    init(load: @escaping @Sendable (String) async throws -> SummaryFiles.Record?, store: SummaryJobStore,
         handler: SummaryJobs.EffectHandler, preferences: PreferencesStore, canDispatch: @escaping () -> Bool, changed: @escaping (String, SummaryJobs.State) -> Void) {
        self.canDispatch = canDispatch
        self.load = load; self.store = store; self.handler = handler; self.preferences = preferences; self.changed = changed
    }
    func recover(call: String) async throws -> SummaryRecovery {
        guard let record = try await load(call) else { return .absent }
        let state = try store.state(record)
        _ = install(state, call: call, observing: state.phase != .pending)
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
        guard config.enabled || submission.requested else { return false }
        model.send(.offer(job, enabled: config.enabled || submission.requested, finalWrite: submission.finalWrite, usable: submission.usable))
        await model.waitForClaim()
        let pending = model.state.phase == .pending
        if !pending { _ = install(model.state, call: submission.call, observing: true) }
        return pending
    }
    var busy: Bool { models.values.contains { $0.busy } }
    /// Only observer models are replaced; local effects retain their model through saving.
    func refreshObserved() async {
        for (call, model) in models where model.state.phase == .observed ||
            (model.observesOwner && [.pending, .running, .interrupted].contains(model.state.phase)) {
            do {
                guard let record = try await load(call) else { throw CocoaError(.fileReadUnknown) }
                let state = try store.state(record)
                guard models[call] === model else { continue }
                _ = install(state, call: call, observing: true)
            } catch {
                guard models[call] === model else { continue }
                // Missing completion evidence cannot release update protection.
                var unresolved = model.state
                unresolved.phase = .observed
                _ = install(unresolved, call: call, observing: true)
            }
        }
    }
    func retry(call: String) async throws {
        guard models[call]?.busy != true, let record = try await load(call) else { throw CocoaError(.fileWriteUnknown) }
        let previous = try store.state(record)
        guard previous.phase == .interrupted || previous.phase == .failed else {
            _ = install(previous, call: call, observing: true)
            throw CocoaError(.fileWriteUnknown)
        }
        let retried = try await store.files.retry(record, job: UUID().uuidString)
        _ = install(try store.state(retried), call: call)
    }
    func dispatch(call: String) async {
        guard canDispatch() else { return }
        await models[call]?.dispatch()
    }
    func recoveryFailed(call: String) async {
        let model = install(.init(), call: call)
        model.send(.storageFailed)
        await model.waitForClaim()
    }
    func job(call: String) -> Job? { models[call]?.state.job }
    func stop(call: String) { models[call]?.cancel() }
    func cancel(call: String) async throws {
        guard let model = models[call] else { return }
        try await model.cancelAndJoin { [store] job in
            guard try await store.files.load(call: call) != nil else { return }
            try await store.discard(job)
        }
        models.removeValue(forKey: call)
    }
    func forget(call: String) async {
        let removed = models.removeValue(forKey: call)
        await removed?.cancelAndJoin()
    }
    func join() async { for model in Array(models.values) { await model.cancelAndJoin() } }
    private func install(_ state: SummaryJobs.State, call: String, observing: Bool = false) -> SummaryJobModel {
        let model = SummaryJobModel(initial: state, observesOwner: observing, canDispatch: canDispatch, handler: handler, format: store.status, changed: { [changed] in changed(call, $0) })
        models[call] = model; changed(call, state)
        return model
    }
}
