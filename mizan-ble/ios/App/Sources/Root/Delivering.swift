/// Adapts an effect handler that delivers one event to the stream a model takes.
/// The handler runs before the stream is returned, as a stream-building one would.
func delivering<Effect, Event: Sendable>(
    _ handle: @escaping (Effect) -> Event
) -> (Effect) -> AsyncStream<Event> {
    { effect in
        let event = handle(effect)
        return AsyncStream { continuation in
            continuation.yield(event)
            continuation.finish()
        }
    }
}

/// Adapts an async effect handler that delivers at most one event. The handler
/// starts before the stream is returned and runs inline until it first suspends;
/// the stream yields its event, if any, then finishes. Ending the stream cancels it.
func delivering<Effect, Event: Sendable>(
    _ handle: @escaping @MainActor (Effect) async -> Event?
) -> @MainActor (Effect) -> AsyncStream<Event> {
    { effect in
        AsyncStream { continuation in
            let task = Task.immediate { @MainActor in
                if let event = await handle(effect) { continuation.yield(event) }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
