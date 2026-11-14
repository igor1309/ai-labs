import CallsListUI
import IMRxObservation
import Observation
import SummaryJobs

/// The Summaries machine, assembled from its reducer, its effect handler and the ports over files and the runtime.
@MainActor @Observable
public final class SummariesModel {
    private let model: ObservableModel<SummariesState, SummariesEvent, SummariesEffect>
    public init(text: @escaping @Sendable () -> CallsListText, preparation: any SummariesPreparation, files: SummariesFilesPort,
         generation: any SummariesGeneration) {
        let reducer = SummariesReducer(format: { text().summariesStatus($0, $1) }, badge: summariesBadge)
        let handler = SummariesEffectHandler(preparation: preparation, claims: files, records: files, starts: files,
                                             storage: files, generation: generation)
        model = ObservableModel(initialState: .init(), reduce: reducer.reduce,
                                handleEffect: { effect in oneEvent { await handler.handle(effect) } })
    }
    public var state: SummariesState { model.state }
    public func send(_ event: SummariesEvent) { model.event(event) }
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
