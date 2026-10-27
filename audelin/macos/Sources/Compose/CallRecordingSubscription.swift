import CoreAudioProcesses
import Recording
import Synchronization

/// Forwards detection until the stream ends or the caller cancels.
public final class CallRecordingSubscription: Sendable {

    /// Detection failures buffered until observed; errors after cancellation are suppressed.
    public let failures: AsyncStream<any Error>

    private let task: Task<Void, Never>
    private let stop: @Sendable () -> Void

    public convenience init(
        calls: AsyncThrowingStream<CallEvent, any Error>, recording: Recording,
        beforeCallStarted: (@Sendable () -> Void)? = nil,
        startedApp: (@Sendable (String) -> Void)? = nil
    ) {

        self.init(calls: calls, recording: recording, beforeCallStarted: beforeCallStarted,
                  startedApp: startedApp, sink: SystemLogSink())
    }

    init(
        calls: AsyncThrowingStream<CallEvent, any Error>, recording: Recording,
        beforeCallStarted: (@Sendable () -> Void)? = nil,
        startedApp: (@Sendable (String) -> Void)? = nil,
        sink: any LogSink
    ) {
        let destination = Mutex(Destination(recording: recording))
        let (failures, output) = AsyncStream<any Error>.makeStream()
        self.failures = failures
        let task = Task {
            defer { output.finish() }
            do {
                for try await event in calls {
                    let forwarded = destination.withLock { state in
                        guard !state.stopped else { return false }
                        switch event {
                        case let .started(app):
                            sink.write(.init(category: .calls, message: "started app=\(app)"))
                            state.callOn = true
                            startedApp?(app)
                            beforeCallStarted?()
                            state.recording?.send(.callStarted)
                        case .ended:
                            sink.write(.init(category: .calls, message: "ended"))
                            state.callOn = false
                            state.recording?.send(.callEnded)
                        }
                        return true
                    }
                    if !forwarded { return }
                }
            } catch {
                destination.withLock { state in
                    guard !state.stopped else { return }
                    sink.write(.init(category: .calls, message: "detection failed", error: String(describing: error)))
                    output.yield(error)
                }
            }
            destination.withLock { state in
                guard !state.stopped else { return }
                if state.callOn {
                    sink.write(.init(category: .calls, message: "ended (detection stream ended)"))
                    state.recording?.send(.callEnded)
                }
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
public func composeCalls(
    _ processes: CoreAudioProcesses, to recording: Recording,
    conditions: RecordingConditions? = nil,
    startedApp: (@Sendable (String) -> Void)? = nil
) throws -> CallRecordingSubscription {

    try processes.start()
    return CallRecordingSubscription(
        calls: processes.calls, recording: recording,
        beforeCallStarted: { conditions?.refresh() }, startedApp: startedApp
    )
}
