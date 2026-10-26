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

struct TranscriptFailureReport: FailureReport {

    let news: AsyncStream<SessionEvent>.Continuation

    func transcriptFailed(_ error: any Error) async {

        news.yield(.pieceFailed(.transcript, error: String(describing: error)))
    }
}
