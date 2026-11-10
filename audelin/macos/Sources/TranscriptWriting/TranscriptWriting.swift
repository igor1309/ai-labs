/// Passes call text through while handing its complete text to saving.
public actor TranscriptWriting<Text: Sendable> {

    public nonisolated let updates: AsyncStream<Text>

    private let continuation: AsyncStream<Text>.Continuation
    private let callText: any CallText<Text>
    private let saving: (any TextSaving<Text>)?
    private var listener: Task<Void, Never>?
    private var stopping: Task<Void, Never>?

    public init(callText: any CallText<Text>, saving: (any TextSaving<Text>)?) {

        self.callText = callText
        self.saving = saving
        // Readers need every snapshot, including those saving may coalesce.
        (updates, continuation) = AsyncStream.makeStream()
    }

    public func start(enabled: Bool = true) async {

        guard listener == nil else { return }
        let incoming = callText.updates
        listener = Task { [continuation, saving] in
            for await text in incoming {
                continuation.yield(text)
                saving?.submit(text)
            }
            continuation.finish()
            await saving?.finish()
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
        let stopping = Task { [callText, listener] in
            await callText.stop()
            await listener?.value
        }
        self.stopping = stopping
        await stopping.value
    }

    deinit {

        listener?.cancel()
        continuation.finish()
    }
}
