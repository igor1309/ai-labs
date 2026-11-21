import CallNames
import Recording

typealias RecordingTranscript = RecordingTranscriptOutput<CallState, CallNamesState>

/// Sends transcript outcomes in order and forwards each closed call's speaker evidence independently.
func subscribeTranscriptFinalization(
    _ output: AsyncStream<RecordingTranscript>, resources: FinalizationResources,
    send: @escaping @Sendable (TranscriptFinalizationModel.Event) async -> Void
) -> Task<Void, Never> {
    Task {
        await withTaskGroup(of: Void.self) { evidence in
            for await value in output {
                switch value {
                case let .opened(call): await send(.opened(call: call))
                case let .wrote(call, text): await send(.wrote(call: call, text))
                case let .writeFailed(call): await send(.writeFailed(call: call))
                case let .closed(call, names):
                    await send(.closed(call: call, names: names))
                    if let port = await resources.resource(call: call)?.transcript.names {
                        evidence.addTask {
                            if let closed = await port.closedEvidence() { await send(.evidenceClosed(call: call, closed)) }
                        }
                    }
                }
            }
            // Transcript input ends with Recording, even if a naming source is still closing.
            await send(.inputEnded)
        }
    }
}
