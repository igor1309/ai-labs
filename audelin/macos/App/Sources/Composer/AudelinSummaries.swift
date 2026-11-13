import Foundation
import Calls
import CallNotes
import Synchronization
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
    var statuses: [String: String] {
        var result = progress.mapValues { text.summaryStatus($0.phase, $0.warning) }
        for (call, model) in notesModels where progress[call] == nil {
            switch model.state {
            case .loading: result[call] = text.summaryStatus(.noting, false)
            case let .failure(failure): result[call] = failure.reason
            default: break
            }
        }
        return result
    }
    func updates() -> AsyncStream<[String: String]> { feed.subscribe(from: statuses) }
    private var coordinator: SummaryCoordinatorModel!
    private var jobs: SummaryCoordinatorJobsAdapter!
    private var interrupted: Set<String> = []
    var retryable: Set<String> {
        interrupted.union(notesModels.compactMap { call, model in
            guard case .failure = model.state,
                  progress[call] == nil || [.failed, .interrupted].contains(progress[call]!.phase) else { return nil }
            return call
        })
    }
    private var jobBadges: [String: CallsListState.Row.Summary] = [:]
    var badges: [String: CallsListState.Row.Summary] {
        var result = jobBadges
        for (call, model) in notesModels where progress[call] == nil {
            switch model.state {
            case .loading: result[call] = .pending
            case .failure: result[call] = .failed
            default: break
            }
        }
        return result
    }
    private var notesModels: [String: CallNotesModel] = [:]
    private var requests: [String: Task<Void, Never>] = [:]
    private var observing: Set<String> = []
    private var cleanupFailed: Set<String> = []
    private var reconciling: [String: Task<Void, any Error>] = [:]
    private let cancelled = SummaryCancellation()
    private let files: SummaryFiles.Files
    private let callText: @Sendable (String) async throws -> Calls.Text
    private let date: @Sendable (Date) -> String
    private let preferences: PreferencesStore
    private var text: CallsListText { didSet { feed.publish(statuses) } }
    init(files: SummaryFiles.Files, runtime: SummaryRuntime.Runtime, preferences: PreferencesStore, sink: any LogSink,
         callText: @escaping @Sendable (String) async throws -> Calls.Text, date: @escaping @Sendable (Date) -> String,
         load: (@Sendable (String) async throws -> SummaryFiles.Record?)? = nil,
         text: CallsListText = .init(language: .russian),
         status: @escaping @Sendable (SummaryJobs.State.Phase, Bool) -> String = { CallsListText(language: .russian).summaryStatus($0, $1) }) {
        self.files = files; self.callText = callText; self.date = date
        self.preferences = preferences
        self.text = text
        let store = SummaryJobStore(files: files, status: status)
        let handler = SummaryJobs.EffectHandler(store: store, generation: SummaryGeneration(runtime: runtime, sink: sink), userCancelled: { [cancelled] job in cancelled.contains(job.id) })
        let jobs = SummaryCoordinatorJobsAdapter(load: load ?? { try await files.load(call: $0) }, store: store,
            handler: handler, preferences: preferences, canDispatch: { [weak self] in self?.coordinator?.canDispatch == true }, changed: { [weak self] call, state in
                if let job = state.job, self?.cancelled.contains(job.id) == true { return }
                if state.phase == .interrupted { self?.interrupted.insert(call) }
                else { self?.interrupted.remove(call) }
                self?.progress[call] = (state.phase, state.warning)
                self?.jobBadges[call] = summaryBadge(state.phase)
                if case .failure = self?.notesModels[call]?.state, summaryBadge(state.phase) == .pending {
                    self?.follow(call: call)
                }
            })
        self.jobs = jobs
        coordinator = SummaryCoordinatorModel(jobs: jobs)
    }
    func waiting(call: String) {
        guard preferences.read().notes.enabled else { return }
        progress[call] = (.waiting, false)
        jobBadges[call] = summaryBadge(.waiting)
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
        guard preferences.read().notes.enabled else {
            if progress[call]?.phase == .waiting {
                progress.removeValue(forKey: call)
                jobBadges.removeValue(forKey: call)
            }
            return
        }
        coordinator.send(.submit(.init(call: call, input: input,
            entries: entries.map { .init(label: $0.label, time: $0.time, text: $0.text) }, finalWrite: finalWrite, usable: usable)))
        follow(call: call)
        await coordinator.wait(call: call)
    }
    func recover(calls: [String]) async {
        for call in calls {
            coordinator.send(.recover(call))
            await coordinator.wait(call: call)
            if let phase = progress[call]?.phase, phase != .idle { follow(call: call) }
        }
    }
    var busy: Bool { coordinator.busy || jobs.busy }
    func refreshObserved() async { await jobs.refreshObserved() }
    func retry(call: String) async throws {
        guard retryable.contains(call) else { throw CocoaError(.fileWriteUnknown) }
        await requests[call]?.value
        if cleanupFailed.contains(call) {
            try await jobs.cancel(call: call)
            cleanupFailed.remove(call)
            await reset(call: call)
            make(call: call)
            return
        }
        // A failed read or claim may leave no durable attempt to retry.
        if let model = notesModels[call], case .failure = model.state,
           try await files.load(call: call) == nil {
            await reset(call: call)
            make(call: call)
            return
        }
        try await coordinator.retry(call: call)
        follow(call: call)
    }
    func forget(call: String) async {
        requests.removeValue(forKey: call)?.cancel()
        notesModels.removeValue(forKey: call)?.close()
        await jobs.forget(call: call)
        interrupted.remove(call)
        cleanupFailed.remove(call)
        progress.removeValue(forKey: call)
        jobBadges.removeValue(forKey: call)
    }
    /// Shows every status in the new language at once.
    func languageChanged(_ text: CallsListText) { self.text = text }
    func stopDispatch() { coordinator.send(.stopDispatch) }
    func shutdown() async {
        let pending = Array(requests.values)
        pending.forEach { $0.cancel() }
        for task in Array(reconciling.values) { _ = try? await task.value }
        await coordinator.shutdown()
        for task in pending { await task.value }
        notesModels.values.forEach { $0.close() }
    }

    func notesState(call: String) -> CallNotesState? { notesModels[call]?.state }

    /// A successful disk read supersedes a completed in-memory result.
    func notes(call: String) async throws -> SummaryFiles.Notes? {
        let previous = notesModels[call]
        let previousState = previous?.state
        let notes = try await files.notes(call: call)
        if let notes {
            let completed = CallNotesState.completed(.init(text: notes.text, date: date(notes.made)))
            if let model = notesModels[call], case .completed = model.state, model.state != completed {
                notesModels.removeValue(forKey: call)?.close()
                _ = notesModel(call: call, initial: completed)
            } else if notesModels[call] == nil && progress[call] == nil {
                _ = notesModel(call: call, initial: completed)
            }
            return notes
        }
        guard case .completed? = previousState, let previous, notesModels[call] === previous else { return nil }
        if let task = reconciling[call] { try await task.value }
        else {
            let task = Task { [self] in
                if let record = try await files.load(call: call) {
                    try await files.discard(record)
                }
                await reset(call: call)
            }
            reconciling[call] = task
            defer { reconciling[call] = nil }
            try await task.value
        }
        return try await files.notes(call: call)
    }

    private func reset(call: String) async {
        await jobs.forget(call: call)
        coordinator.send(.forget(call))
        notesModels.removeValue(forKey: call)?.close()
        observing.remove(call)
        progress.removeValue(forKey: call)
        jobBadges.removeValue(forKey: call)
        interrupted.remove(call)
    }

    func make(call: String) {
        let model = notesModel(call: call)
        guard model.state == .pending else { return }
        model.send(.load)
    }

    func cancel(call: String) async {
        guard let model = notesModels[call], model.state == .loading else { return }
        model.send(.cancel)
        for await state in Observations({ model.state }) where state == .pending { break }
        await requests[call]?.value
    }

    private func follow(call: String) {
        let model = notesModel(call: call)
        switch model.state {
        case .pending, .failure: break
        default: return
        }
        observing.insert(call)
        model.send(.load)
    }

    private func notesModel(call: String, initial: CallNotesState = .pending) -> CallNotesModel {
        if let model = notesModels[call] { return model }
        let handler = CallNotesEffectHandler(load: { [weak self] completion in
            guard let self else { return }
            let observed = observing.remove(call) != nil
            let previous = requests[call]
            requests[call] = Task { [weak self] in
                await previous?.value
                guard let self, !Task.isCancelled else { return }
                let result = await loadNotes(call: call, observing: observed)
                if !Task.isCancelled { completion(result) }
            }
        }, cancel: { [weak self] in
            guard let self else { return }
            let previous = requests[call]
            previous?.cancel()
            if let job = jobs.job(call: call) { cancelled.insert(job.id) }
            jobs.stop(call: call)
            requests[call] = Task { [weak self] in
                guard let self else { return }
                await coordinator.wait(call: call)
                let job = jobs.job(call: call)
                if let job { cancelled.insert(job.id) }
                defer { if let job { cancelled.remove(job.id) } }
                do {
                    try await jobs.cancel(call: call)
                    await previous?.value
                    coordinator.send(.forget(call))
                    progress.removeValue(forKey: call)
                    jobBadges.removeValue(forKey: call)
                    interrupted.remove(call)
                } catch {
                    await previous?.value
                    cleanupFailed.insert(call)
                    notesModels.removeValue(forKey: call)?.close()
                    _ = notesModel(call: call, initial: .failure(.init(reason: error.localizedDescription)))
                    jobBadges[call] = .failed
                    progress[call] = (.failed, false)
                }
            }
        })
        let model = CallNotesModel(initial: initial, date: date, handler: handler)
        notesModels[call] = model
        return model
    }

    private func loadNotes(call: String, observing: Bool) async -> Result<CallNotesEvent.Loaded, CallNotes.Failure> {
        do {
            if observing { await coordinator.wait(call: call) }
            else {
                let transcript = try await callText(call)
                try Task.checkCancellation()
                let entries = transcript.transcript.map { Job.Entry(label: $0.label, time: String($0.start), text: $0.words) }
                coordinator.send(.submit(.init(call: call, input: summaryInput(entries),
                    entries: entries.map { .init(label: $0.label, time: $0.time, text: $0.text) }, finalWrite: true, usable: !entries.isEmpty, requested: true)))
                await coordinator.wait(call: call)
            }
            for await _ in updates() {
                try Task.checkCancellation()
                guard let phase = progress[call]?.phase else { continue }
                if phase == .succeeded {
                    guard let notes = try await files.notes(call: call) else { throw CocoaError(.fileReadNoSuchFile) }
                    return .success(.init(text: notes.text, date: notes.made))
                }
                if [.failed, .interrupted, .unavailable].contains(phase) {
                    return .failure(.init(reason: text.summaryStatus(phase, progress[call]?.warning ?? false)))
                }
            }
            throw CancellationError()
        } catch { return .failure(.init(reason: error.localizedDescription)) }
    }
}

/// Cancellation belongs to an attempt, including while its resources unwind.
private final class SummaryCancellation: Sendable {
    private let jobs = Mutex<Set<String>>([])
    func contains(_ id: String) -> Bool { jobs.withLock { $0.contains(id) } }
    func insert(_ id: String) { jobs.withLock { _ = $0.insert(id) } }
    func remove(_ id: String) { jobs.withLock { _ = $0.remove(id) } }
}
