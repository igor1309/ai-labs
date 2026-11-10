import CallDiarizer
import Foundation
import Session
import Synchronization
import TranscriptFile
import TranscriptFormat
import protocol TranscriptWriting.CallText
import protocol TranscriptWriting.TextSaving
import class SavePacing.SavePacing
import protocol SavePacing.Saving
import protocol SavePacing.FailureReport

struct WritingCallText: TranscriptWriting.CallText {

    let text: CallReader

    init(text: CallReader) { self.text = text }

    var updates: AsyncStream<CallState> { text.updates }
    func start(enabled: Bool) async { await text.start(enabled: enabled) }
    func setEnabled(_ enabled: Bool) async { await text.setEnabled(enabled) }
    func stop() async { await text.stop() }
}

/// A recording's transcript destination, kept open until its text has stopped.
public protocol SessionTranscriptFile: Sendable {

    func write(_ state: CallState) async throws

    func close() async

    /// Replaces the closed transcript atomically; a failure keeps its previous bytes.
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment], at destination: URL?) async throws
}

extension SessionTranscriptFile {
    public func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws {
        try await replaceMicrophone(in: state, with: segments, at: nil)
    }
}

struct PacedTextSaving<Value: Sendable>: TextSaving {

    let pacing: SavePacing<Value>

    func submit(_ text: Value) { pacing.submit(text) }
    func finish() async { await pacing.finish() }
}

struct TranscriptDestination: Saving {

    let file: any SessionTranscriptFile

    func save(_ state: CallState) async throws { try await file.write(state) }
}

/// Renders call text for the transcript; `TranscriptFormat` in the app.
protocol TranscriptRenderer: Sendable {

    mutating func renderWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) throws -> TranscriptFormat.Rendering

    mutating func render(count: Int, finalCount: Int, speakers: [TranscriptFormat.Speaker], segment: (Int) -> TranscriptFormat.Segment) throws -> TranscriptFormat.Rendering
}

/// Keeps rendered bytes on disk; `TranscriptFile` in the app.
protocol TranscriptBytes: Sendable {

    func write(_ chunks: [Data], finalLength: Int?) async throws
    func replace(_ chunks: [Data], finalLength: Int?, at destination: URL?) async throws
    func close() async
}

extension TranscriptBytes {
    func replace(_ chunks: [Data], finalLength: Int?) async throws {
        try await replace(chunks, finalLength: finalLength, at: nil)
    }
}

extension TranscriptFormat: TranscriptRenderer {
    mutating func renderWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) throws -> TranscriptFormat.Rendering {
        self = TranscriptFormat()
        return try render(segments, speakers: speakers)
    }
}
extension TranscriptFile: TranscriptBytes {}

actor WritingTranscript: SessionTranscriptFile {

    let file: any TranscriptBytes
    let sink: any LogSink
    private let names: LiveNameBoard
    private var format: any TranscriptRenderer
    private var replaceNext = false
    private var closed = false
    private var closedNames: LiveNameBoard.Names?
    private var last: CallState?

    init(file: any TranscriptBytes, format: any TranscriptRenderer, names: LiveNameBoard, sink: any LogSink) {
        self.file = file; self.format = format; self.names = names; self.sink = sink
    }

    /// Logs each save with the final count it wrote, so a reader of the log knows
    /// how many entries on disk will not change again.
    func write(_ state: CallState) async throws {

        guard !closed else { throw TranscriptFile.Failure.writingEnded }
        last = state
        try await save(state)
    }

    private func save(_ state: CallState) async throws {

        let entries = state.entries, finalCount = state.finalCount
        let names = names.snapshot()
        let rendering: TranscriptFormat.Rendering
        do {
            rendering = try format.render(count: entries.count, finalCount: finalCount, speakers: Composer.Transcript.speakers(names)) {
                let entry = entries[$0]
                return Composer.Transcript.segment(from: entry, speaker: names.rows[entry.text.id].flatMap { names.ids[$0] })
            }
        } catch {
            replaceNext = true
            throw error
        }
        let replace = replaceNext
        replaceNext = false
        if replace {
            try await file.replace(rendering.chunks, finalLength: rendering.finalLength)
        } else {
            try await file.write(rendering.chunks, finalLength: rendering.finalLength)
        }
        sink.write(.init(category: .session, message: "transcript saved finalCount=\(finalCount)"))
    }

    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment], at destination: URL?) async throws {

        let board = closedNames ?? names.snapshot()
        let rendering = try format.renderWhole(
            Composer.Transcript.replacingMicrophone(in: state, with: segments, names: board),
            speakers: Composer.Transcript.speakers(board)
        )
        try await file.replace(rendering.chunks, finalLength: rendering.finalLength, at: destination)
    }

    /// Runs the after-call pass first, so confirmed names replace the live guesses before
    /// the file is sealed. A failed pass keeps the tentative names.
    func close() async {

        let board = names.snapshot()
        if let state = last, let track = board.callTrack, !board.spoken.isEmpty {
            do {
                let turns = try await CallDiarizer().turns(of: track)
                let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
                let confirmed = AfterCallNames.names(rows: rows, turns: turns, board: board)
                names.confirm(confirmed)
                await names.announce(confirmed)
                try await save(state)
                sink.write(.init(category: .session, message: "after-call names saved turns=\(turns.count)"))
            } catch {
                sink.write(.init(category: .session, message: "after-call names failed: \(error)"))
            }
        }
        closedNames = names.snapshot()
        closed = true
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

    func saveFailed(_ error: any Error) async {

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
        var format = TranscriptFormat()
        let initial = try format.render([])
        let file = try await TranscriptFile(url: url, initialBytes: initial.chunks, binding: DiskTranscriptBinding())
        // Opening has no live write revision; the first saved speaker block starts at one.
        return WritingTranscript(file: file, format: TranscriptFormat(), names: .shared, sink: sink)
    }
}
