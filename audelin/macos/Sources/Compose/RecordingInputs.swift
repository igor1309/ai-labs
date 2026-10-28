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

// Bridge until the app composes Recording's model.
extension RecordingInputs {

    /// Holds the recording weakly: its owner keeps it alive, and a released one takes no events.
    public init(recording: Recording) {

        self.init(
            send: { [weak recording] in recording?.send($0) },
            state: { [weak recording] in await recording?.snapshot() ?? RecordingState() },
            states: { [weak recording] in
                guard let recording else { return AsyncStream { $0.finish() } }
                return await recording.states()
            },
            end: { [weak recording] in await recording?.end() }
        )
    }
}
