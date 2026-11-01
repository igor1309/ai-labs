import struct CallText.State
import Session
import Synchronization
import TranscriptFile
import protocol TranscriptWriting.CallText
import protocol TranscriptWriting.Transcript
import protocol TranscriptWriting.FailureReport

struct WritingCallText: TranscriptWriting.CallText {

    let text: CallReader

    init(text: CallReader) { self.text = text }

    var updates: AsyncStream<State> { text.updates }
    func start(enabled: Bool) async { await text.start(enabled: enabled) }
    func setEnabled(_ enabled: Bool) async { await text.setEnabled(enabled) }
    func stop() async { await text.stop() }
}

/// A recording's transcript destination, kept open until its text has stopped.
protocol SessionTranscriptFile: Sendable {

    func write(_ state: State) async throws

    func close() async
}

struct TranscriptDestination: TranscriptWriting.Transcript {

    let file: any SessionTranscriptFile

    func write(_ state: State) async throws { try await file.write(state) }
}

struct WritingTranscript: SessionTranscriptFile {

    let file: TranscriptFile

    init(file: TranscriptFile) { self.file = file }

    func write(_ state: State) async throws {

        let entries = state.entries
        try await file.write(count: entries.count, finalCount: state.finalCount) {
            Composer.Transcript.segment(from: entries[$0])
        }
    }

    func close() async { await file.close() }
}

final class TranscriptFailureReport: FailureReport, Sendable {

    // Kept in a struct: a bare closure in a Mutex is rewrapped by every access.
    private struct Delivery: Sendable {

        let deliver: @Sendable (SessionEvent) async -> Void
    }

    private let delivery: Mutex<Delivery>

    init(deliver: @escaping @Sendable (SessionEvent) async -> Void) {

        delivery = Mutex(Delivery(deliver: deliver))
    }

    func connect(deliver: @escaping @Sendable (SessionEvent) async -> Void) {

        delivery.withLock { $0 = Delivery(deliver: deliver) }
    }

    func transcriptFailed(_ error: any Error) async {

        let deliver = delivery.withLock { $0.deliver }
        await deliver(.pieceFailed(.transcript, error: String(describing: error)))
    }
}
