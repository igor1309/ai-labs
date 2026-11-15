import CallNames
import Recording

typealias RecordingTranscript = RecordingTranscriptOutput<CallState, CallNamesState>

/// Draining this subscription orders finalization shutdown after the last transcript outcome.
func subscribeTranscriptFinalization(
    _ output: AsyncStream<RecordingTranscript>,
    send: @escaping @Sendable (TranscriptFinalizationModel.Event) async -> Void
) -> Task<Void, Never> {
    Task {
        for await value in output {
            let event: TranscriptFinalizationModel.Event = switch value {
            case let .opened(call): .opened(call: call)
            case let .wrote(call, text): .wrote(call: call, text)
            case let .writeFailed(call): .writeFailed(call: call)
            case let .closed(call, names): .closed(call: call, names: names)
            }
            await send(event)
        }
    }
}
