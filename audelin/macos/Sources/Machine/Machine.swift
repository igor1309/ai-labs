/// Runs a reducer and delivers its effects independently.
public actor Machine<State: Equatable & Sendable, Event: Sendable, Effect: Sendable> {

    private enum Input: Sendable {

        case event(Event)
        case snapshot(CheckedContinuation<State, Never>)
    }

    private nonisolated let input: AsyncStream<Input>.Continuation
    private let reduce: @Sendable (State, Event) -> (State, Effect?)
    private let handle: @Sendable (Effect) async -> Event
    private var state: State
    private var ended = false
    private var subscribers: [UInt64: AsyncStream<State>.Continuation] = [:]
    private var effects: [UInt64: Task<Void, Never>] = [:]
    private var nextSubscriber: UInt64 = 0
    private var nextEffect: UInt64 = 0

    public init(
        initial: State,
        reduce: @escaping @Sendable (State, Event) -> (State, Effect?),
        handle: @escaping @Sendable (Effect) async -> Event
    ) {

        self.init(initial: initial, reduce: reduce, handle: handle, beforeNext: {})
    }

    // A turn boundary lets a caller hold consumption without holding producers.
    init(
        initial: State,
        reduce: @escaping @Sendable (State, Event) -> (State, Effect?),
        handle: @escaping @Sendable (Effect) async -> Event,
        beforeNext: @escaping @Sendable () async -> Void
    ) {

        state = initial
        self.reduce = reduce
        self.handle = handle
        let (queue, input) = AsyncStream<Input>.makeStream()
        self.input = input
        Task { [weak self] in
            var iterator = queue.makeAsyncIterator()
            while true {
                await beforeNext()
                guard let item = await iterator.next(), let self else { break }
                await self.take(item)
            }
        }
    }

    deinit {

        input.finish()
        for subscriber in subscribers.values { subscriber.finish() }
    }

    /// Enqueues an event behind everything already sent, including results.
    public nonisolated func send(_ event: Event) {

        input.yield(.event(event))
    }

    /// Reads the state after events already queued have been reduced.
    public nonisolated func snapshot() async -> State {

        await withCheckedContinuation { answer in
            if case .terminated = input.yield(.snapshot(answer)) {
                Task { answer.resume(returning: await self.state) }
            }
        }
    }

    /// Each subscription starts with the current state and retains every change.
    public func states() -> AsyncStream<State> {

        let id = nextSubscriber
        nextSubscriber += 1
        let (stream, continuation) = AsyncStream<State>.makeStream()
        continuation.yield(state)
        if ended {
            continuation.finish()
        } else {
            subscribers[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { await self?.removeSubscriber(id) }
            }
        }
        return stream
    }

    /// Ends delivery. Compose must first settle work that could need cleanup.
    public func end() {

        ended = true
        input.finish()
        for subscriber in subscribers.values { subscriber.finish() }
        subscribers.removeAll()
    }

    // Waiting for handler completion also proves that its result was enqueued.
    func waitForEffects() async {

        let pending = Array(effects.values)
        for effect in pending { await effect.value }
    }

    private func take(_ item: Input) {

        switch item {
        case .snapshot(let answer):
            answer.resume(returning: state)
        case .event(let event):
            guard !ended else { return }
            let (next, effect) = reduce(state, event)
            let changed = next != state
            state = next
            if changed {
                for subscriber in subscribers.values { subscriber.yield(next) }
            }
            if let effect { start(effect) }
        }
    }

    private func start(_ effect: Effect) {

        let id = nextEffect
        nextEffect += 1
        let handle = handle
        let input = input
        effects[id] = Task.detached { [weak self] in
            let result = await handle(effect)
            input.yield(.event(result))
            await self?.effectFinished(id)
        }
    }

    private func effectFinished(_ id: UInt64) {

        effects[id] = nil
    }

    private func removeSubscriber(_ id: UInt64) {

        subscribers[id] = nil
    }
}
