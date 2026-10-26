import CoreAudioProcesses
import Recording
import Synchronization

/// Forwards detection until the stream ends or the caller cancels.
public final class CallRecordingSubscription: Sendable {

    private let task: Task<Void, Never>
    private let stop: @Sendable () -> Void

    public init(calls: AsyncThrowingStream<CallEvent, any Error>, recording: Recording) {

        let destination = Mutex(Destination(recording: recording))
        let task = Task {
            do {
                for try await event in calls {
                    let forwarded = destination.withLock { state in
                        guard !state.stopped else { return false }
                        switch event {
                        case .started:
                            state.callOn = true
                            state.recording?.send(.callStarted)
                        case .ended:
                            state.callOn = false
                            state.recording?.send(.callEnded)
                        }
                        return true
                    }
                    if !forwarded { return }
                }
            } catch {
                // Losing detection ends its call just as a finished stream does.
            }
            destination.withLock { state in
                guard !state.stopped else { return }
                if state.callOn { state.recording?.send(.callEnded) }
                state.callOn = false
                state.stopped = true
            }
        }
        self.task = task
        stop = {
            // Sending under the same lock makes cancellation a delivery boundary.
            destination.withLock { $0.stopped = true }
            task.cancel()
        }
    }

    deinit { stop() }

    /// On return, no more events will be sent, including a synthetic call end.
    public func cancel() { stop() }

    /// Joins consumption after stream termination or cancellation.
    public func wait() async { await task.value }

    private struct Destination: Sendable {

        // The destination must not keep its Recording alive through the task.
        weak var recording: Recording?
        var callOn = false
        var stopped = false
    }
}

/// The caller owns the detector's lifetime and stops it when detection is no longer needed.
public func composeCalls(_ processes: CoreAudioProcesses, to recording: Recording) throws -> CallRecordingSubscription {

    try processes.start()
    return CallRecordingSubscription(calls: processes.calls, recording: recording)
}
