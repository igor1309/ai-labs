import Foundation
import IMRxObservation
import Observation
import Preferences
import SummaryFiles
import SummaryJobs
import SummaryRuntime

/// Each job's model runs independently. Submission awaits durable claim only;
/// recording cleanup never joins a generation request.
@MainActor @Observable
final class AudelinSummaries {
    private(set) var statuses: [String: String] = [:]
    private let store: SummaryJobStore
    private let handler: SummaryJobs.EffectHandler
    private let reducer = SummaryJobs.Reducer(format: summaryStatus)
    private var states: [String: SummaryJobs.State] = [:]
    private var running: [String: Task<Void, Never>] = [:]
    private var dispatch = true
    private let preferences: PreferencesStore
    init(files: SummaryFiles.Files, runtime: SummaryRuntime.Runtime, preferences: PreferencesStore, sink: any LogSink) {
        store = .init(files: files); self.preferences = preferences
        handler = .init(store: store, generation: SummaryGeneration(runtime: runtime, sink: sink), cancelled: { Task.isCancelled })
    }
    func waiting(call: String) { statuses[call] = summaryStatus(.waiting, false) }
    func submit(call: String, input: String, entries: [Job.Entry], finalWrite: Bool, usable: Bool) async {
        guard states[call] == nil else { return }
        let config = preferences.read().notes
        func runtime(_ value: NotesPreferences.Runtime) -> Job.Runtime {
            .init(kind: value.kind, model: value.model, program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
        }
        let job = Job(id: UUID().uuidString, call: call, input: input, entries: entries, speakers: config.speakers,
                      primary: runtime(config.primary), fallback: runtime(config.fallback))
        let (state, effect) = reducer.reduce(.init(), .offer(job, enabled: config.enabled, finalWrite: finalWrite, usable: usable))
        states[call] = state; statuses[call] = state.status
        if let effect {
            // Register before suspending so duplicate completion cannot claim or start again.
            let event = await handler.handle(effect)
            receive(event, call: call)
        }
        start(call: call)
    }
    func recover(calls: [String]) async {
        for call in calls where states[call] == nil {
            // Register arbitration before the asynchronous disk read.
            states[call] = .init(phase: .claiming)
            do {
                if let record = try await store.files.load(call: call) {
                    let state = try store.state(record)
                    states[call] = state; statuses[call] = state.status
                    start(call: call)
                } else { states[call] = nil }
            } catch {
                states[call] = .init(phase: .failed, status: summaryStatus(.failed, false)); statuses[call] = summaryStatus(.failed, false)
            }
        }
    }
    func stopDispatch() { dispatch = false }
    func shutdown() async {
        dispatch = false
        let tasks = Array(running.values)
        for task in tasks { task.cancel() }
        for task in tasks { await task.value }
    }
    private func start(call: String) {
        guard dispatch, running[call] == nil, states[call]?.phase == .pending else { return }
        running[call] = Task { [self] in
            var effect = receive(.dispatch, call: call)
            while let work = effect {
                if Task.isCancelled { _ = receive(.cancel, call: call); break }
                effect = receive(await handler.handle(work), call: call)
            }
            running[call] = nil
        }
    }
    @discardableResult private func receive(_ event: SummaryJobs.Event, call: String) -> SummaryJobs.Effect? {
        let (state, effect) = reducer.reduce(states[call] ?? .init(), event)
        states[call] = state; statuses[call] = state.status
        return effect
    }
}
