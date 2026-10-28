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
        calls: AsyncThrowingStream<CallEvent, any Error>, recording: RecordingInputs,
        beforeCallStarted: (@Sendable () async -> Void)? = nil,
        startedApp: (@Sendable (String) -> Void)? = nil
    ) {

        self.init(calls: calls, recording: recording, beforeCallStarted: beforeCallStarted,
                  startedApp: startedApp, sink: SystemLogSink())
    }

    init(
        calls: AsyncThrowingStream<CallEvent, any Error>, recording: RecordingInputs,
        beforeCallStarted: (@Sendable () async -> Void)? = nil,
        startedApp: (@Sendable (String) -> Void)? = nil,
        sink: any LogSink
    ) {
        let destination = Mutex(Destination())
        let (failures, output) = AsyncStream<any Error>.makeStream()
        self.failures = failures
        let task = Task {
            defer { output.finish() }
            do {
                for try await event in calls {
                    let forwarded = destination.withLock { state -> RecordingEvent? in
                        guard !state.stopped else { return nil }
                        switch event {
                        case let .started(app):
                            sink.write(.init(category: .calls, message: "started app=\(app)"))
                            state.callOn = true
                            startedApp?(app)
                            return .callStarted
                        case .ended:
                            sink.write(.init(category: .calls, message: "ended"))
                            state.callOn = false
                            return .callEnded
                        }
                    }
                    guard let forwarded else { return }
                    if forwarded == .callStarted {
                        await beforeCallStarted?()
                        // A cancel during the refresh must still keep the start from being sent.
                        guard !destination.withLock({ $0.stopped }) else { return }
                    }
                    await recording.send(forwarded)
                }
            } catch {
                destination.withLock { state in
                    guard !state.stopped else { return }
                    sink.write(.init(category: .calls, message: "detection failed", error: String(describing: error)))
                    output.yield(error)
                }
            }
            let endsCall = destination.withLock { state in
                guard !state.stopped else { return false }
                let callOn = state.callOn
                if callOn { sink.write(.init(category: .calls, message: "ended (detection stream ended)")) }
                state.callOn = false
                state.stopped = true
                return callOn
            }
            if endsCall { await recording.send(.callEnded) }
        }
        self.task = task
        stop = {
            destination.withLock { $0.stopped = true }
            task.cancel()
        }
    }

    deinit { stop() }

    /// On return, no further event is admitted, including a synthetic call end; one already
    /// admitted may still be sent until `wait()` returns.
    public func cancel() { stop() }

    /// Joins consumption after stream termination or cancellation, including a send in flight:
    /// after `cancel()`, its return is the delivery boundary.
    public func wait() async { await task.value }

    private struct Destination: Sendable {

        var callOn = false
        var stopped = false
    }
}

/// The caller owns the detector's lifetime and stops it when detection is no longer needed.
public func composeCalls(
    _ processes: CoreAudioProcesses, to recording: RecordingInputs,
    conditions: RecordingConditions? = nil,
    startedApp: (@Sendable (String) -> Void)? = nil
) throws -> CallRecordingSubscription {

    try processes.start()
    return CallRecordingSubscription(
        calls: processes.calls, recording: recording,
        beforeCallStarted: { await conditions?.refresh() }, startedApp: startedApp
    )
}
