public protocol LifecycleDelivery: Sendable {

    /// Returns after producers have stopped and their forwarding work has joined.
    func stop() async
}

public enum LifecycleRecordingState: Equatable, Sendable {

    case busy
    case idle
}

public protocol LifecycleRecording: Sendable {

    func requestStop()
    /// Returns after all previously delivered events, including the stop, were reduced.
    func drain() async
    /// Starts with the current state and retains every subsequent change.
    func states() async -> AsyncStream<LifecycleRecordingState>
    func end() async
}

public enum LifecycleState: Equatable, Sendable {

    case running, stoppingDelivery, draining, waiting, ending, terminating, terminated
}

public enum LifecycleEvent: Equatable, Sendable {

    case quit, deliveryStopped, drained, idle, ended, terminated
}

public enum LifecycleEffect: Equatable, Sendable {

    case stopDelivery, stopRecording, waitForIdle, end, terminate
}

public enum LifecycleReducer {

    public static func reduce(_ state: LifecycleState, _ event: LifecycleEvent) -> (LifecycleState, LifecycleEffect?) {

        switch (state, event) {
        case (.running, .quit): (.stoppingDelivery, .stopDelivery)
        case (.stoppingDelivery, .deliveryStopped): (.draining, .stopRecording)
        case (.draining, .drained): (.waiting, .waitForIdle)
        case (.waiting, .idle): (.ending, .end)
        case (.ending, .ended): (.terminating, .terminate)
        case (.terminating, .terminated): (.terminated, nil)
        default: (state, nil)
        }
    }
}

public struct LifecycleEffectHandler: Sendable {

    private let delivery: any LifecycleDelivery
    private let recording: any LifecycleRecording
    private let terminate: @Sendable () async -> Void

    public init(
        delivery: any LifecycleDelivery, recording: any LifecycleRecording,
        terminate: @escaping @Sendable () async -> Void
    ) {

        self.delivery = delivery
        self.recording = recording
        self.terminate = terminate
    }

    /// Delivers the one event that completes the effect, then finishes.
    public func handle(_ effect: LifecycleEffect) -> AsyncStream<LifecycleEvent> {

        AsyncStream { output in
            let task = Task {
                output.yield(await perform(effect))
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }

    private func perform(_ effect: LifecycleEffect) async -> LifecycleEvent {

        switch effect {
        case .stopDelivery:
            await delivery.stop()
            return .deliveryStopped
        case .stopRecording:
            recording.requestStop()
            await recording.drain()
            return .drained
        case .waitForIdle:
            for await state in await recording.states() {
                if state == .idle { return .idle }
            }
            // An ended observation is not evidence that cleanup completed.
            return .drained
        case .end:
            await recording.end()
            return .ended
        case .terminate:
            await terminate()
            return .terminated
        }
    }
}
