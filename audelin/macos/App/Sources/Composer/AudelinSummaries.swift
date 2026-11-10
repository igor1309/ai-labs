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
    private var coordinator: SummaryCoordinatorModel!
    private let preferences: PreferencesStore
    init(files: SummaryFiles.Files, runtime: SummaryRuntime.Runtime, preferences: PreferencesStore, sink: any LogSink, load: (@Sendable (SummaryCall) async throws -> SummaryFiles.Record?)? = nil) {
        self.preferences = preferences
        let store = SummaryJobStore(files: files)
        let handler = SummaryJobs.EffectHandler(store: store, generation: SummaryGeneration(runtime: runtime, sink: sink), cancelled: { Task.isCancelled })
        let jobs = SummaryCoordinatorJobsAdapter(load: load ?? { try await files.load(call: $0.call, recording: $0.recording) }, store: store,
            handler: handler, preferences: preferences, changed: { [weak self] call, status in self?.statuses[call] = status })
        coordinator = SummaryCoordinatorModel(jobs: jobs)
    }
    func waiting(call: String) {
        guard preferences.read().notes.enabled else { return }
        statuses[call] = summaryStatus(.waiting, false)
    }
    func callbacks(timeZone: TimeZone) -> SummaryCallbacks {
        SummaryCallbacks(waiting: { [weak self] folder in
            guard let call = Calls.id(in: folder.lastPathComponent, timeZone: timeZone) else { return }
            await self?.waiting(call: call)
        }, completed: { [weak self] folder, recording, entries, finalWrite, usable in
            guard let call = Calls.id(in: folder.lastPathComponent, timeZone: timeZone) else { return }
            await self?.submit(call: call, recording: recording, input: summaryInput(entries), entries: entries, finalWrite: finalWrite, usable: usable)
        })
    }
    func submit(call: String, recording: UUID? = nil, input: String, entries: [Job.Entry], finalWrite: Bool, usable: Bool) async {
        coordinator.send(.submit(.init(call: call, recording: recording, input: input,
            entries: entries.map { .init(label: $0.label, time: $0.time, text: $0.text) }, finalWrite: finalWrite, usable: usable)))
        await coordinator.wait(call: .init(call: call, recording: recording))
    }
    func recover(calls: [SummaryCall]) async {
        for call in calls {
            coordinator.send(.recover(call))
            await coordinator.wait(call: call)
        }
    }
    var busy: Bool { coordinator.busy }
    func stopDispatch() { coordinator.send(.stopDispatch) }
    func shutdown() async { await coordinator.shutdown() }
}
