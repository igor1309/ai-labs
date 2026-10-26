import struct CallText.State
import Session
import Synchronization
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

final class TranscriptFailureReport: FailureReport, Sendable {

    private let delivery: Mutex<@Sendable (SessionEvent) -> Void>

    init(deliver: @escaping @Sendable (SessionEvent) -> Void) {

        delivery = Mutex(deliver)
    }

    func connect(deliver: @escaping @Sendable (SessionEvent) -> Void) {

        delivery.withLock { $0 = deliver }
    }

    func transcriptFailed(_ error: any Error) {

        delivery.withLock { deliver in
            deliver(.pieceFailed(.transcript, error: String(describing: error)))
        }
    }
}
