/// Runs a reducer and feeds independent effects' results back as events.
@MainActor
public final class Machine<State: Equatable & Sendable, Event: Sendable, Effect: Sendable> {
    public typealias Reducer = (State, Event) -> (State, Effect?)
    public typealias Handler = @Sendable (Effect) async -> Event?

    public private(set) var state: State
    private let reducer: Reducer
    private let handler: Handler
    private var ended = false
    private var nextSubscriber = 0
    private var subscribers: [Int: AsyncStream<State>.Continuation] = [:]
    private var nextEffect = 0
    private var effects: [Int: Task<Void, Never>] = [:]

    public init(initialState: State, reducer: @escaping Reducer, handler: @escaping Handler) {
        state = initialState
        self.reducer = reducer
        self.handler = handler
    }

    deinit {
        for subscriber in subscribers.values { subscriber.finish() }
    }

    /// Reduction never suspends, so a result cannot overtake events already sent.
    public func send(_ event: Event) {
        guard !ended else { return }
        let (newState, effect) = reducer(state, event)
        if newState != state {
            state = newState
            for subscriber in subscribers.values { subscriber.yield(state) }
        }
        guard let effect else { return }
        let id = nextEffect
        nextEffect += 1
        let handler = handler
        effects[id] = Task { [weak self] in
            guard self?.ended == false else {
                self?.effects.removeValue(forKey: id)
                return
            }
            let result = await handler(effect)
            guard let self else { return }
            if let result { self.send(result) }
            self.effects.removeValue(forKey: id)
        }
    }

    /// Each subscription buffers every change and starts with the current state.
    public func states() -> AsyncStream<State> {
        let (stream, continuation) = AsyncStream<State>.makeStream()
        continuation.yield(state)
        guard !ended else {
            continuation.finish()
            return stream
        }
        let id = nextSubscriber
        nextSubscriber += 1
        subscribers[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { @MainActor in self?.subscribers.removeValue(forKey: id) }
        }
        return stream
    }

    /// Finishes subscriptions and rejects further events, including late results.
    /// Running handlers may finish; ending does not require their cooperation.
    public func end() {
        ended = true
        for subscriber in subscribers.values { subscriber.finish() }
        subscribers.removeAll()
    }

    /// Waits for outstanding handlers and any work their results request.
    public func waitForEffects() async {
        while let effect = effects.values.first { await effect.value }
    }
}
