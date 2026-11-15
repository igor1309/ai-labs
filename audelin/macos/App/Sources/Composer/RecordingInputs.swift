import Recording

/// Recording's model as used by the composer.
struct RecordingInputs: Sendable {

    var transcriptOutput: AsyncStream<RecordingTranscript> = AsyncStream { $0.finish() }
    var reserveStorage: @Sendable () async -> Bool = { false }
    var releaseStorage: @Sendable () async -> Void = {}
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

extension RecordingInputs {

    /// Like `states`, without the changes that touch only the pieces, which come with every audio window.
    func ownStates() async -> AsyncStream<RecordingState> {

        let states = await states()
        return AsyncStream { continuation in
            let forwarding = Task {
                var last: RecordingState?
                for await state in states {
                    let own = recordingOwnState(state)
                    guard own != last else { continue }
                    last = own
                    continuation.yield(state)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in forwarding.cancel() }
        }
    }
}
