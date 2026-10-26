import struct CallText.State
import Session
import Synchronization
import TranscriptFile
import protocol TranscriptWriting.CallText
import protocol TranscriptWriting.Transcript
import protocol TranscriptWriting.FailureReport

public struct WritingCallText: TranscriptWriting.CallText {

    let text: CallReader

    public init(text: CallReader) { self.text = text }

    public var updates: AsyncStream<State> { text.updates }
    public func start(enabled: Bool) async { await text.start(enabled: enabled) }
    public func setEnabled(_ enabled: Bool) async { await text.setEnabled(enabled) }
    public func stop() async { await text.stop() }
}

/// A recording's transcript destination, kept open until its text has stopped.
public protocol SessionTranscriptFile: Sendable {

    func write(_ state: State) async throws

    func close() async
}

struct TranscriptDestination: TranscriptWriting.Transcript {

    let file: any SessionTranscriptFile

    func write(_ state: State) async throws { try await file.write(state) }
}

public struct WritingTranscript: SessionTranscriptFile {

    let file: TranscriptFile

    public init(file: TranscriptFile) { self.file = file }

    public func write(_ state: State) async throws {

        try await file.write(Compose.Transcript.segments(from: state))
    }

    public func close() async { await file.close() }
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
