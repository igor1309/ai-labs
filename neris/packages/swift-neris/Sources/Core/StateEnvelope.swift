import Synchronization

/// Reduces an async event stream to a synchronously queryable state via `Mutex`.
public final class StateEnvelope<Event: Sendable, State: Sendable>: @unchecked Sendable {

    private let state: Mutex<State>
    private var task: Task<Void, Never>?

    public init(initial: State, stream: AsyncStream<Event>, map: @escaping @Sendable (Event) -> State) {
        state = Mutex(initial)
        task = Task { [weak self] in
            for await event in stream {
                self?.state.withLock { $0 = map(event) }
            }
        }
    }

    public func query() -> State {
        state.withLock { $0 }
    }

    deinit { task?.cancel() }
}
