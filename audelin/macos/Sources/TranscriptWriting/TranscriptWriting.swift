/// Passes call text through while keeping its complete text in a transcript.
public actor TranscriptWriting<Text: Sendable> {

    public nonisolated let updates: AsyncStream<Text>

    private let continuation: AsyncStream<Text>.Continuation
    private let callText: any CallText<Text>
    private let transcript: (any Transcript<Text>)?
    private let failureReport: any FailureReport
    private var listener: Task<Void, Never>?
    private var writer: Task<Void, Never>?

    public init(
        callText: any CallText<Text>, transcript: (any Transcript<Text>)?,
        failureReport: any FailureReport
    ) {

        self.callText = callText
        self.transcript = transcript
        self.failureReport = failureReport
        (updates, continuation) = AsyncStream.makeStream()
    }

    public func start(enabled: Bool = true) async {

        guard listener == nil else { return }
        let incoming = callText.updates
        let pending = AsyncStream<Text>.makeStream(bufferingPolicy: .bufferingNewest(1))
        writer = Task { [transcript] in
            for await text in pending.stream {
                try? await transcript?.write(text)
            }
        }
        listener = Task { [continuation] in
            for await text in incoming {
                continuation.yield(text)
                pending.continuation.yield(text)
            }
            pending.continuation.finish()
            continuation.finish()
        }
        await callText.start(enabled: enabled)
    }

    public func setEnabled(_ enabled: Bool) async {

        await callText.setEnabled(enabled)
    }

    public func stop() async {

        await callText.stop()
        await listener?.value
        await writer?.value
    }

    deinit {

        listener?.cancel()
        writer?.cancel()
        continuation.finish()
    }
}
