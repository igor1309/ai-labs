import Recording

/// Recording's model as used by the composer.
struct RecordingInputs: Sendable {

    var send: @Sendable (RecordingEvent) async -> Void
    /// Returns state that includes every event whose `send` already returned.
    var state: @Sendable () async -> RecordingState
    /// Starts with the current state and retains every subsequent change.
    var states: @Sendable () async -> AsyncStream<RecordingState>
    var end: @Sendable () async -> Void

    init(
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
