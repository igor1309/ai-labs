import Calls
import CallsListUI
import IMRxObservation
import Observation
import SummaryJobs

/// The Summaries machine, assembled from its reducer, its effect handler and the ports over files and the runtime.
@MainActor @Observable
public final class SummariesModel {
    private let model: ObservableModel<SummariesState, SummariesEvent, SummariesEffect>
    private let callText: @Sendable (String) async throws -> Calls.Text
    public init(text: @escaping @Sendable () -> CallsListText, callText: @escaping @Sendable (String) async throws -> Calls.Text, preparation: any SummariesPreparation, files: SummariesFilesPort,
         generation: any SummariesGeneration) {
        self.callText = callText
        let reducer = SummariesReducer(format: { text().summariesStatus($0, $1) }, badge: summariesBadge)
        let handler = SummariesEffectHandler(preparation: preparation, claims: files, records: files, starts: files,
                                             storage: files, generation: generation)
        model = ObservableModel(initialState: .init(), reduce: reducer.reduce,
                                handleEffect: { effect in oneEvent { await handler.handle(effect) } })
    }
    public var state: SummariesState { model.state }
    public func send(_ event: SummariesEvent) { model.event(event) }

    /// Hands a finished recording's transcript to the machine.
    public func completed(call: String, entries: [Job.Entry], finalWrite: Bool, usable: Bool) {
        model.event(.submit(.init(call: call, input: summaryInput(entries), entries: entries, finalWrite: finalWrite, usable: usable)))
    }
    /// Makes notes the user asked for from the call's stored transcript, even when notes are off.
    public func make(call: String) async throws {
        let entries = try await callText(call).transcript.map { Job.Entry(label: $0.label, time: String($0.start), text: $0.words) }
        model.event(.submit(.init(call: call, input: summaryInput(entries), entries: entries, finalWrite: true,
                                  usable: !entries.isEmpty, requested: true)))
    }
    public func cancel(call: String) { model.event(.cancel(call)) }
    public func retry(call: String) { model.event(.retry(call)) }
    /// Drops a deleted call once its notes have settled.
    public func forget(call: String) { model.event(.forget(call)) }
    /// Picks up each stored call's job at launch.
    public func recover(calls: [String]) { calls.forEach { model.event(.recover($0)) } }
    /// Reads again the calls whose jobs another process runs.
    public func refresh() { model.event(.refresh) }
    /// Starts no new job; running ones go on.
    public func stopDispatch() { model.event(.stopDispatch) }
    /// Drains the machine and returns once it has ended.
    public func shutdown() async {
        model.event(.shutdown)
        while model.state.lifecycle != .ended { await changed() }
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
        case .recovering, .preparing: self(.summaryWaiting)
        case .claiming, .pending, .observed, .retrying, .discarding: self(.summaryPending)
        case .starting, .identifying, .checkpointing, .noting, .publishing, .saving: self(.summaryRunning)
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
