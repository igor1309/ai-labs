import Calls
import Foundation
import CallsListUI
import IMRxObservation
import Observation
import SummaryJobs

/// The Summaries machine, assembled from its reducer, its effect handler and the ports over files and the runtime.
@MainActor @Observable
public final class SummariesModel {
    private let model: ObservableModel<SummariesState, SummariesEvent, SummariesEffect>
    private let reducer: SummariesReducer
    private var listText: CallsListText
    public init(text: @escaping @Sendable () -> CallsListText, preparation: any SummariesPreparation, files: SummariesFilesPort,
         generation: any SummariesGeneration) {
        listText = text()
        let reducer = SummariesReducer(format: { text().summariesStatus($0, $1) }, badge: summariesBadge)
        self.reducer = reducer
        let handler = SummariesEffectHandler(preparation: preparation, claims: files, records: files, starts: files,
                                             storage: files, generation: generation)
        model = ObservableModel(initialState: .init(), reduce: reducer.reduce,
                                handleEffect: { effect in oneEvent { await handler.handle(effect) } })
    }
    public var state: SummariesState { model.state }
    public func send(_ event: SummariesEvent) { model.event(event) }

    /// Each call's notes status as the calls list shows it.
    /// Each status is written in the language Audelin is shown in now.
    public var statuses: [String: String] { model.state.calls.mapValues { listText.summariesStatus($0.stage, $0.warning) } }
    /// Shows every status in the new language at once.
    public func languageChanged(_ text: CallsListText) { listText = text }
    /// The statuses as they change, starting with the current ones.
    public func updates() -> AsyncStream<[String: String]> {
        AsyncStream { output in
            let task = Task { @MainActor [weak self] in
                guard let self else { output.finish(); return }
                for await statuses in Observations({ self.statuses }) { output.yield(statuses) }
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }
    /// Whether a job is being made or stored in this process, which an update must not cut short.
    public var busy: Bool { SummariesReducer.busy(model.state) }
    /// Hands the ended recording, with whether notes are on, to the machine.
    func callbacks(timeZone: TimeZone, notesOn: @escaping @Sendable () -> Bool) -> SummaryCallbacks {
        SummaryCallbacks(waiting: { [weak self] folder in
            guard let call = Calls.id(in: folder.lastPathComponent, timeZone: timeZone) else { return }
            await self?.waiting(call: call, notesOn: notesOn())
        })
    }
    /// Each call's calls list icon.
    public var badges: [String: CallsListState.Row.Summary] {
        model.state.calls.mapValues {
            switch $0.badge { case .none: .none; case .pending: .pending; case .failed: .failed }
        }
    }
    /// The calls whose notes the user can make again.
    public var retryable: Set<String> { Set(model.state.calls.filter(\.value.retryable).keys) }
    /// Shows a just-ended recording as waiting for its transcript while notes are on.
    public func waiting(call: String, notesOn: Bool) { model.event(.waiting(call, notesOn: notesOn)) }
    /// Makes notes the user asked for from the call's stored transcript, even when notes are off.
    public func make(call: String) { model.event(.request(call)) }
    /// Stops the call's notes and returns once the attempt is discarded or has settled.
    public func cancel(call: String) async {
        model.event(.cancel(call))
        // The event is reduced later; until then a cancel would still act. It is done once another
        // cancel would change nothing and no discard is left.
        while reducer.reduce(model.state, .cancel(call)).0 != model.state
                || model.state.calls[call].map({ $0.cancelling || $0.stage == .discarding }) == true { await changed() }
    }
    /// Runs a failed or interrupted call's job again; throws when there is none to run or storage refuses it.
    public func retry(call: String) async throws {
        let before = model.state
        guard before.calls[call]?.retryable == true, before.lifecycle == .accepting, before.dispatch else { throw CocoaError(.fileWriteUnknown) }
        model.event(.retry(call))
        while model.state.calls[call] == before.calls[call] || model.state.calls[call]?.stage == .retrying { await changed() }
        if model.state.calls[call]?.retryFailed == true { throw CocoaError(.fileWriteUnknown) }
    }
    /// Drops a deleted call once its notes have settled.
    public func forget(call: String) { model.event(.forget(call)) }
    /// Picks up each stored call's job at launch.
    public func recover(calls: [String]) { calls.forEach { model.event(.recover($0)) } }
    /// Reads again the calls whose jobs another process runs or may run again, and returns once they are read.
    public func refresh() async {
        let before = model.state
        guard before.refreshing || reducer.reduce(before, .refresh).0 != before else { return }
        model.event(.refresh)
        // The refresh changes the state: it starts a reload, or one already runs. A stale read only keeps
        // an observed call counted as busy.
        repeat { await changed() } while model.state.refreshing
    }
    /// Starts no new job; running ones go on.
    public func stopDispatch() { model.event(.stopDispatch) }
    /// Drains the machine and returns once it has published settled.
    public func shutdown() async {
        model.event(.shutdown)
        for await lifecycle in Observations({ self.model.state.lifecycle }) where lifecycle == .settled { return }
    }
    private func changed() async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            withObservationTracking { _ = model.state } onChange: { done.resume() }
        }
    }
}

extension CallsListText {
    /// A call's notes status as its calls list row shows it, from the Summaries machine's stage.
    func summariesStatus(_ stage: SummariesState.Call.Stage, _ warning: Bool) -> String {
        switch stage {
        case .waiting, .recovering, .preparing: self(.summaryWaiting)
        case .claiming, .pending, .observed, .retrying, .discarding: self(.summaryPending)
        case .reading, .starting, .identifying, .checkpointing, .noting, .deferred, .publishing, .saving: self(.summaryRunning)
        case .succeeded: warning ? self(.summaryReadyUnnamed) : self(.summaryReady)
        case .failed: self(.summaryFailed)
        case .interrupted: self(.summaryInterrupted)
        case .unavailable: self(.summaryUnavailable)
        }
    }
}

/// The Summaries machine's badge for a stage.
@Sendable func summariesBadge(_ stage: SummariesState.Call.Stage) -> SummariesState.Call.Badge {
    switch stage {
    case .succeeded: .none
    case .failed, .interrupted, .unavailable: .failed
    default: .pending
    }
}
