import Foundation
import Calls
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
    private let feed = StateFeed<[String: String]>()
    private(set) var statuses: [String: String] = [:] { didSet { feed.publish(statuses) } }
    func updates() -> AsyncStream<[String: String]> { feed.subscribe(from: statuses) }
    private let load: @Sendable (String) async throws -> SummaryFiles.Record?
    private let store: SummaryJobStore
    private let handler: SummaryJobs.EffectHandler
    private var models: [String: SummaryJobModel] = [:]
    private var recovery: [String: Task<Void, Never>] = [:]
    private var dispatch = true
    private let preferences: PreferencesStore
    init(files: SummaryFiles.Files, runtime: SummaryRuntime.Runtime, preferences: PreferencesStore, sink: any LogSink, load: (@Sendable (String) async throws -> SummaryFiles.Record?)? = nil) {
        self.load = load ?? { try await files.load(call: $0) }
        store = .init(files: files); self.preferences = preferences
        handler = .init(store: store, generation: SummaryGeneration(runtime: runtime, sink: sink), cancelled: { Task.isCancelled })
    }
    func waiting(call: String) {
        guard preferences.read().notes.enabled else { return }
        statuses[call] = summaryStatus(.waiting, false)
    }
    func callbacks(timeZone: TimeZone) -> SummaryCallbacks {
        SummaryCallbacks(waiting: { [weak self] folder in
            guard let call = Calls.id(in: folder.lastPathComponent, timeZone: timeZone) else { return }
            await self?.waiting(call: call)
        }, completed: { [weak self] folder, entries, finalWrite, usable in
            guard let call = Calls.id(in: folder.lastPathComponent, timeZone: timeZone) else { return }
            await self?.submit(call: call, input: summaryInput(entries), entries: entries, finalWrite: finalWrite, usable: usable)
        })
    }
    func submit(call: String, input: String, entries: [Job.Entry], finalWrite: Bool, usable: Bool) async {
        await recovery[call]?.value
        guard models[call] == nil else { return }
        let config = preferences.read().notes
        func runtime(_ value: NotesPreferences.Runtime) -> Job.Runtime {
            .init(kind: value.kind, model: value.model, program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
        }
        let job = Job(id: UUID().uuidString, call: call, input: input, entries: entries, speakers: config.speakers,
                      primary: runtime(config.primary), fallback: runtime(config.fallback))
        let model = install(.init(), call: call)
        guard config.enabled else { return }
        model.send(.offer(job, enabled: config.enabled, finalWrite: finalWrite, usable: usable))
        await model.waitForClaim()
        start(call: call)
    }
    func recover(calls: [String]) async {
        for call in calls {
            if let task = recovery[call] { await task.value; continue }
            guard models[call] == nil else { continue }
            let task = Task { [self] in
                do {
                    if let record = try await load(call) {
                        let state = try store.state(record)
                        _ = install(state, call: call)
                        start(call: call)
                    }
                } catch {
                    _ = install(.init(phase: .failed, status: summaryStatus(.failed, false)), call: call)
                }
            }
            recovery[call] = task
            await task.value
            recovery[call] = nil
        }
    }
    func stopDispatch() { dispatch = false }
    func shutdown() async {
        dispatch = false
        for task in Array(recovery.values) { await task.value }
        for model in Array(models.values) { await model.cancelAndJoin() }
    }
    private func start(call: String) {
        guard dispatch, let model = models[call], model.state.phase == .pending else { return }
        model.send(.dispatch)
    }
    private func install(_ state: SummaryJobs.State, call: String) -> SummaryJobModel {
        let model = SummaryJobModel(initial: state, handler: handler, changed: { [weak self] in self?.statuses[call] = $0.status })
        models[call] = model; statuses[call] = state.status
        return model
    }
}
