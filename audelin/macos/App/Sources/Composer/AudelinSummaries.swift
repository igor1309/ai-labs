import Foundation
import Calls
import CallsListUI
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
    private var coordinator: SummaryCoordinatorModel!
    private var jobs: SummaryCoordinatorJobsAdapter!
    private(set) var retryable: Set<String> = []
    private let preferences: PreferencesStore
    private let text: CallsListText
    init(files: SummaryFiles.Files, runtime: SummaryRuntime.Runtime, preferences: PreferencesStore, sink: any LogSink, load: (@Sendable (String) async throws -> SummaryFiles.Record?)? = nil,
         text: CallsListText = .init(language: .russian)) {
        self.preferences = preferences
        self.text = text
        let store = SummaryJobStore(files: files, status: { text.summaryStatus($0, $1) })
        let handler = SummaryJobs.EffectHandler(store: store, generation: SummaryGeneration(runtime: runtime, sink: sink), cancelled: { Task.isCancelled })
        let jobs = SummaryCoordinatorJobsAdapter(load: load ?? { try await files.load(call: $0) }, store: store,
            handler: handler, preferences: preferences, canDispatch: { [weak self] in self?.coordinator?.canDispatch == true }, changed: { [weak self] call, state in
                if state.phase == .interrupted { self?.retryable.insert(call) }
                else { self?.retryable.remove(call) }
                self?.statuses[call] = state.status
            })
        self.jobs = jobs
        coordinator = SummaryCoordinatorModel(jobs: jobs)
    }
    func waiting(call: String) {
        guard preferences.read().notes.enabled else { return }
        statuses[call] = text.summaryStatus(.waiting, false)
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
        coordinator.send(.submit(.init(call: call, input: input,
            entries: entries.map { .init(label: $0.label, time: $0.time, text: $0.text) }, finalWrite: finalWrite, usable: usable)))
        await coordinator.wait(call: call)
    }
    func recover(calls: [String]) async {
        for call in calls {
            coordinator.send(.recover(call))
            await coordinator.wait(call: call)
        }
    }
    var busy: Bool { coordinator.busy || jobs.busy }
    func refreshObserved() async { await jobs.refreshObserved() }
    func retry(call: String) async throws { try await coordinator.retry(call: call) }
    func forget(call: String) async {
        await jobs.forget(call: call)
        retryable.remove(call)
        statuses.removeValue(forKey: call)
    }
    func stopDispatch() { coordinator.send(.stopDispatch) }
    func shutdown() async { await coordinator.shutdown() }
}
