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
