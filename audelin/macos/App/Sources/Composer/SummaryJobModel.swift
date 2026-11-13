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
    let observesOwner: Bool
    private let handler: EffectHandler
    init(initial: State, observesOwner: Bool, canDispatch: @escaping () -> Bool, handler: EffectHandler, format: @escaping @Sendable (State.Phase, Bool) -> String, changed: @escaping (State) -> Void) {
        self.observesOwner = observesOwner
        self.handler = handler
        let reducer = Reducer(format: format)
        model = ObservableModel(initialState: initial, reduce: { [weak self] state, event in
            guard let self else { return (state, nil) }
            let result = event == .dispatch && !canDispatch() ? (state, nil) : reducer.reduce(state, stopping ? .cancel : event)
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
    var busy: Bool {
        switch state.phase {
        case .claiming, .running, .observed, .starting, .identifying, .checkpointing, .noting, .publishing, .saving: return true
        default: return false
        }
    }
    func send(_ event: Event) { model.event(event) }
    /// Acknowledge processing, including a dispatch withdrawn before reduction.
    func dispatch() async {
        let reductions = feed.subscribe(from: state).dropFirst()
        model.event(.dispatch)
        for await _ in reductions { return }
    }
    func waitForClaim() async {
        for await state in feed.subscribe(from: model.state) where state.phase != .idle && state.phase != .claiming { return }
    }
    func cancel() {
        stopping = true
        model.event(.cancel)
        for task in effects.values { task.cancel() }
    }
    func cancelAndJoin() async { await cancelAndJoin(beforeRelease: { _ in }) }
    /// Discarding a user-cancelled attempt must finish before its ownership is released.
    func cancelAndJoin(beforeRelease: (Job) async throws -> Void) async rethrows {
        cancel()
        let tasks = Array(effects.values)
        for task in tasks { await task.value }
        if let job = model.state.job {
            do { try await beforeRelease(job) }
            catch { await handler.release(job); throw error }
            await handler.release(job)
        }
    }
}
