import IMRxObservation

/// Stop-dispatch reduces synchronously before recording cleanup can offer another call.
@MainActor final class SummaryCoordinatorModel {
    private let model: SyncModel<SummaryCoordinatorState, SummaryCoordinatorEvent>
    private let feed = StateFeed<SummaryCoordinatorState>()
    private var doer: SummaryCoordinatorDoer!
    init(jobs: any SummaryCoordinatorJobs) {
        let reducer = SummaryCoordinatorReducer()
        model = SyncModel(initialState: .init(), reduce: reducer.reduce)
        doer = SummaryCoordinatorDoer(jobs: jobs, send: { [weak self] in self?.send($0) })
    }
    func send(_ event: SummaryCoordinatorEvent) {
        model.event(event)
        feed.publish(model.state)
        doer.act(on: model.state)
    }
    /// A pending call survives a quit and is recovered at the next launch.
    var busy: Bool { model.state.calls.values.contains { $0.phase != .pending && $0.phase != .installed } }
    func wait(call: SummaryCall) async {
        for await state in feed.subscribe(from: model.state) {
            switch state.calls[call]?.phase {
            case .recovering, .submitting, .dispatching, .failing: continue
            default: return
            }
        }
    }
    func shutdown() async {
        send(.shutdown)
        for await state in feed.subscribe(from: model.state) where state.phase == .ended { break }
        await doer.join()
    }
}
