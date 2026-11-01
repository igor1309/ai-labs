import Session

/// One Session's model as used by the composer.
struct SessionInputs: Sendable {

    /// Returns once the event is queued behind every event whose `send` already returned.
    var send: @Sendable (SessionEvent) async -> Void
    /// Starts with the current state and retains every subsequent change.
    var states: @Sendable () async -> AsyncStream<SessionState>
    /// Finishes every `states` stream; later events change nothing.
    var end: @Sendable () async -> Void

    init(
        send: @escaping @Sendable (SessionEvent) async -> Void,
        states: @escaping @Sendable () async -> AsyncStream<SessionState>,
        end: @escaping @Sendable () async -> Void
    ) {

        self.send = send
        self.states = states
        self.end = end
    }
}

/// Makes one Session's model from its effect handler.
typealias MakeSessionModel = @Sendable (_ handler: SessionEffectHandler) async -> SessionInputs
