import Session

/// What Compose needs from one Session's model; the app supplies it.
public struct SessionInputs: Sendable {

    /// Returns once the event is queued behind every event whose `send` already returned.
    public var send: @Sendable (SessionEvent) async -> Void
    /// Starts with the current state and retains every subsequent change.
    public var states: @Sendable () async -> AsyncStream<SessionState>
    /// Finishes every `states` stream; later events change nothing.
    public var end: @Sendable () async -> Void

    public init(
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
public typealias MakeSessionModel = @Sendable (_ handler: SessionEffectHandler) async -> SessionInputs
