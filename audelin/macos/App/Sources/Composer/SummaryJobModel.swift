import IMRxObservation
import SummaryJobs

/// Owns the generic model and joins the concrete resources started by its effects.
@MainActor
final class SummaryJobModel {
    private var model: ObservableModel<State, Event, Effect>!
    private let feed = StateFeed<State>()
    private var effects: [UInt64: Task<Void, Never>] = [:]
    private var sequence: UInt64 = 0
    private var stopping = false
    private var dispatchRequested = false
    private let handler: EffectHandler
    init(initial: State, handler: EffectHandler, changed: @escaping (State) -> Void) {
        self.handler = handler
        let reducer = Reducer(format: summaryStatus)
        model = ObservableModel(initialState: initial, reduce: { [weak self] state, event in
            guard let self else { return (state, nil) }
            if event == .dispatch { dispatchRequested = false }
            let result = reducer.reduce(state, stopping ? .cancel : event)
            feed.publish(result.0); changed(result.0)
            return result
        }, handleEffect: { [weak self] effect in
            guard let self, !stopping else { return AsyncStream { $0.yield(.cancel); $0.finish() } }
            sequence += 1
            let token = sequence
            return AsyncStream { output in
                let task = Task { [weak self] in
                    output.yield(await handler.handle(effect)); output.finish()
                    self?.effects[token] = nil
                }
                effects[token] = task
                output.onTermination = { _ in task.cancel() }
            }
        })
    }
    var state: State { model.state }
    /// Dispatch is asynchronous; reserve the entire handoff before the model reduces it.
    var busy: Bool {
        if dispatchRequested { return true }
        switch state.phase {
        case .claiming, .running, .starting, .identifying, .checkpointing, .noting, .publishing, .saving: return true
        default: return false
        }
    }
    func send(_ event: Event) {
        if event == .dispatch && state.phase == .pending { dispatchRequested = true }
        model.event(event)
    }
    func waitForClaim() async {
        for await state in feed.subscribe(from: model.state) where state.phase != .idle && state.phase != .claiming { return }
    }
    func cancelAndJoin() async {
        stopping = true
        model.event(.cancel)
        let tasks = Array(effects.values)
        for task in tasks { task.cancel() }
        for task in tasks { await task.value }
        if let job = model.state.job { await handler.release(job) }
    }
}
