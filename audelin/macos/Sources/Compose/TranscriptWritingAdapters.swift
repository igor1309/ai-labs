import struct CallText.State
import Session
import TranscriptFile
import protocol TranscriptWriting.CallText
import protocol TranscriptWriting.Transcript
import protocol TranscriptWriting.FailureReport

struct WritingCallText: TranscriptWriting.CallText {

    let text: CallReader

    var updates: AsyncStream<State> { text.updates }
    func start(enabled: Bool) async { await text.start(enabled: enabled) }
    func setEnabled(_ enabled: Bool) async { await text.setEnabled(enabled) }
    func stop() async { await text.stop() }
}

struct WritingTranscript: TranscriptWriting.Transcript {

    let file: TranscriptFile
    let beforeWrite: @Sendable (State) async throws -> Void

    func write(_ state: State) async throws {

        try await beforeWrite(state)
        try await file.write(Compose.Transcript.segments(from: state))
    }
}

actor TranscriptFailureReport: FailureReport {

    let news: AsyncStream<SessionEvent>.Continuation
    private var pending: [CheckedContinuation<Void, Never>] = []

    init(news: AsyncStream<SessionEvent>.Continuation) { self.news = news }

    func transcriptFailed(_ error: any Error) async {

        await withCheckedContinuation { delivered in
            pending.append(delivered)
            news.yield(.pieceFailed(.transcript, error: String(describing: error)))
        }
    }

    func forwarded(_ event: SessionEvent) {

        guard case .pieceFailed(.transcript, _) = event, !pending.isEmpty else { return }
        // The subscription acknowledges in stream order, after enqueueing in Session.
        pending.removeFirst().resume()
    }
}
