/// Passes call text through while keeping its complete text in a transcript.
public actor TranscriptWriting<Text: Sendable> {

    public nonisolated let updates: AsyncStream<Text>

    private let continuation: AsyncStream<Text>.Continuation
    private let callText: any CallText<Text>
    private let transcript: (any Transcript<Text>)?
    private let failureReport: any FailureReport
    private var listener: Task<Void, Never>?
    private var writer: Task<Void, Never>?
    private var stopping: Task<Void, Never>?

    public init(
        callText: any CallText<Text>, transcript: (any Transcript<Text>)?,
        failureReport: any FailureReport
    ) {

        self.callText = callText
        self.transcript = transcript
        self.failureReport = failureReport
        // Readers need every snapshot; only pending whole-file writes may coalesce.
        (updates, continuation) = AsyncStream.makeStream()
    }

    public func start(enabled: Bool = true) async {

        guard listener == nil else { return }
        let incoming = callText.updates
        let pending = AsyncStream<Text>.makeStream(bufferingPolicy: .bufferingNewest(1))
        writer = Task { [transcript, failureReport] in
            // A transcript that keeps failing is reported once, until a write succeeds.
            var failing = false
            for await text in pending.stream {
                do {
                    try await transcript?.write(text)
                    failing = false
                } catch {
                    if !failing { await failureReport.transcriptFailed(error) }
                    failing = true
                }
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

        if let stopping {
            await stopping.value
            return
        }
        let stopping = Task { [callText, listener, writer] in
            await callText.stop()
            await listener?.value
            await writer?.value
        }
        self.stopping = stopping
        await stopping.value
    }

    deinit {

        listener?.cancel()
        writer?.cancel()
        continuation.finish()
    }
}
