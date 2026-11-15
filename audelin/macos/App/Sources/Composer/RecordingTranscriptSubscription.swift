import CallNames
import Recording

typealias RecordingTranscript = RecordingTranscriptOutput<CallState, CallNamesState>

/// Sends finalization each transcript outcome in order, and input ended once the output ends:
/// Recording's transcript output ends only when Recording settles, after its last close.
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
        await send(.inputEnded)
    }
}
