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
    /// Each call's job phase and whether its notes lack speaker names, shown as `statuses`.
    private var progress: [String: (phase: SummaryJobs.State.Phase, warning: Bool)] = [:] { didSet { feed.publish(statuses) } }
    /// Each call's notes status, in the language Audelin is shown in.
    var statuses: [String: String] { progress.mapValues { text.summaryStatus($0.phase, $0.warning) } }
    func updates() -> AsyncStream<[String: String]> { feed.subscribe(from: statuses) }
    private var coordinator: SummaryCoordinatorModel!
    private var jobs: SummaryCoordinatorJobsAdapter!
    private(set) var retryable: Set<String> = []
    private(set) var badges: [String: CallsListState.Row.Summary] = [:]
    private let preferences: PreferencesStore
    private var text: CallsListText { didSet { feed.publish(statuses) } }
    init(files: SummaryFiles.Files, runtime: SummaryRuntime.Runtime, preferences: PreferencesStore, sink: any LogSink, load: (@Sendable (String) async throws -> SummaryFiles.Record?)? = nil,
         text: CallsListText = .init(language: .russian),
         status: @escaping @Sendable (SummaryJobs.State.Phase, Bool) -> String = { CallsListText(language: .russian).summaryStatus($0, $1) }) {
        self.preferences = preferences
        self.text = text
        let store = SummaryJobStore(files: files, status: status)
        let handler = SummaryJobs.EffectHandler(store: store, generation: SummaryGeneration(runtime: runtime, sink: sink), userCancelled: { _ in false })
        let jobs = SummaryCoordinatorJobsAdapter(load: load ?? { try await files.load(call: $0) }, store: store,
            handler: handler, preferences: preferences, canDispatch: { [weak self] in self?.coordinator?.canDispatch == true }, changed: { [weak self] call, state in
                if state.phase == .interrupted { self?.retryable.insert(call) }
                else { self?.retryable.remove(call) }
                self?.progress[call] = (state.phase, state.warning)
                self?.badges[call] = summaryBadge(state.phase)
            })
        self.jobs = jobs
        coordinator = SummaryCoordinatorModel(jobs: jobs)
    }
    func waiting(call: String) {
        guard preferences.read().notes.enabled else { return }
        progress[call] = (.waiting, false)
        badges[call] = summaryBadge(.waiting)
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
        progress.removeValue(forKey: call)
        badges.removeValue(forKey: call)
    }
    /// Shows every status in the new language at once.
    func languageChanged(_ text: CallsListText) { self.text = text }
    func stopDispatch() { coordinator.send(.stopDispatch) }
    func shutdown() async { await coordinator.shutdown() }
}
