@testable import Audelin
import CoreAudioProcesses
import Foundation
import LiveText
import Recording
@testable import Composer

struct TestLogSink: LogSink { func write(_ entry: LogEntry) {} }
let testIntervals = ProfileIntervals { _ in {} }

extension CallRecordingSubscription {
    convenience init(
        calls: AsyncThrowingStream<CallEvent, any Error>, recording: RecordingInputs,
        beforeCallStarted: (@Sendable () async -> Void)? = nil,
        startedApp: (@Sendable (String) -> Void)? = nil
    ) {

        self.init(calls: calls, recording: recording, beforeCallStarted: beforeCallStarted,
                  startedApp: startedApp, sink: TestLogSink())
    }

}
func composeCalls(_ processes: CoreAudioProcesses, to recording: RecordingInputs, conditions: RecordingConditions?,
                  startedApp: (@Sendable (String) -> Void)? = nil) async throws -> CallRecordingSubscription {
    try await composeCalls(processes, to: recording, conditions: conditions, startedApp: startedApp, sink: TestLogSink())
}
func startLiveModelLoading(recognizerSource: @escaping @Sendable () async throws -> any Recognizer) -> Task<Void, any Error> {
    loadModel(recognizerSource: recognizerSource, sink: TestLogSink())
}
