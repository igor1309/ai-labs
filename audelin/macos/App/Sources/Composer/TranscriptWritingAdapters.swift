import CallDiarizer
import Foundation
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
public protocol SessionTranscriptFile: Sendable {

    func write(_ state: State) async throws

    func close() async
}

struct TranscriptDestination: TranscriptWriting.Transcript {

    let file: any SessionTranscriptFile

    func write(_ state: State) async throws { try await file.write(state) }
}

final class WritingTranscript: SessionTranscriptFile {

    let file: TranscriptFile
    let sink: any LogSink
    private let last = Mutex<State?>(nil)

    init(file: TranscriptFile, sink: any LogSink) { self.file = file; self.sink = sink }

    /// Logs each save with the final count it wrote, so a reader of the log knows
    /// how many entries on disk will not change again.
    func write(_ state: State) async throws {

        last.withLock { $0 = state }
        try await save(state)
    }

    private func save(_ state: State) async throws {

        let entries = state.entries, finalCount = state.finalCount
        let names = LiveNameBoard.shared.snapshot()
        try await file.write(count: entries.count, finalCount: finalCount, speakers: Composer.Transcript.speakers(names)) {
            let entry = entries[$0]
            return Composer.Transcript.segment(from: entry, speaker: names.rows[entry.text.id].flatMap { names.ids[$0] })
        }
        sink.write(.init(category: .session, message: "transcript saved finalCount=\(finalCount)"))
    }

    /// Runs the after-call pass first, so confirmed names replace the live guesses before
    /// the file is sealed. A failed pass keeps the tentative names.
    func close() async {

        let board = LiveNameBoard.shared.snapshot()
        if let state = last.withLock({ $0 }), let track = board.callTrack, !board.spoken.isEmpty {
            do {
                let turns = try await CallDiarizer().turns(of: track)
                let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
                LiveNameBoard.shared.confirm(AfterCallNames.names(rows: rows, turns: turns, board: board))
                try await save(state)
                sink.write(.init(category: .session, message: "after-call names saved turns=\(turns.count)"))
            } catch {
                sink.write(.init(category: .session, message: "after-call names failed: \(error)"))
            }
        }
        await file.close()
    }
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


public protocol TranscriptStorage: Sendable {
    func open(at url: Foundation.URL, sink: any LogSink) async throws -> any SessionTranscriptFile
}
public struct FileTranscriptStorage: TranscriptStorage {
    public init() {}
    public func open(at url: Foundation.URL, sink: any LogSink) async throws -> any SessionTranscriptFile {
        try await WritingTranscript(file: TranscriptFile(url: url), sink: sink)
    }
}
