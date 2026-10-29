import Recording

/// What Compose needs from Recording's model; the app supplies it.
public struct RecordingInputs: Sendable {

    public var send: @Sendable (RecordingEvent) async -> Void
    /// Returns state that includes every event whose `send` already returned.
    public var state: @Sendable () async -> RecordingState
    /// Starts with the current state and retains every subsequent change.
    public var states: @Sendable () async -> AsyncStream<RecordingState>
    public var end: @Sendable () async -> Void

    public init(
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        state: @escaping @Sendable () async -> RecordingState,
        states: @escaping @Sendable () async -> AsyncStream<RecordingState>,
        end: @escaping @Sendable () async -> Void
    ) {

        self.send = send
        self.state = state
        self.states = states
        self.end = end
    }
}
