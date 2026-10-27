import Machine

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

public enum LifecycleEvent: Sendable {

    case quit, deliveryStopped, drained, idle, ended, terminated
}

public enum LifecycleEffect: Sendable {

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

public final class Lifecycle: Sendable {

    private let machine: Machine<LifecycleState, LifecycleEvent, LifecycleEffect>

    public init(
        delivery: any LifecycleDelivery, recording: any LifecycleRecording,
        terminate: @escaping @Sendable () async -> Void
    ) {

        machine = Machine(initial: .running, reduce: LifecycleReducer.reduce, handle: { effect in
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
        })
    }

    public func quit() async {

        machine.send(.quit)
        for await state in await machine.states() {
            if state == .terminated { break }
        }
        await machine.end()
    }
}
