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
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws
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

    mutating func render(count: Int, finalCount: Int, speakers: [TranscriptFormat.Speaker], segment: (Int) -> TranscriptFormat.Segment) throws -> TranscriptFormat.Rendering

    /// Renders a whole replacement from nothing, leaving the live rendering as it was.
    func renderWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) throws -> TranscriptFormat.Rendering
}

/// Keeps rendered bytes on disk; `TranscriptFile` in the app.
protocol TranscriptBytes: Sendable {

    func write(_ chunks: [Data], finalLength: Int?) async throws
    func replace(_ chunks: [Data], finalLength: Int?) async throws
    func close() async
}

extension TranscriptFormat: TranscriptRenderer {

    func renderWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) throws -> TranscriptFormat.Rendering {

        var fresh = TranscriptFormat()
        return try fresh.render(segments, speakers: speakers)
    }
}
extension TranscriptFile: TranscriptBytes {}

actor WritingTranscript: SessionTranscriptFile {

    let file: any TranscriptBytes
    let sink: any LogSink
    private let names: LiveNameBoard
    private let diarizer: CallDiarizer
    private var format: any TranscriptRenderer
    private var replaceNext = false
    private var closed = false
    private var closedNames: LiveNameBoard.Names?
    /// The far side as the after-call pass gave it to diarized speakers; nil keeps plain Them.
    private var attributed: Composer.Transcript.Attributed?
    private var last: CallState?

    init(file: any TranscriptBytes, format: any TranscriptRenderer, names: LiveNameBoard, diarizer: CallDiarizer, sink: any LogSink) {
        self.file = file; self.format = format; self.names = names; self.diarizer = diarizer; self.sink = sink
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

    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws {

        let rendering: TranscriptFormat.Rendering
        if let attributed {
            let microphone = segments.map { TranscriptFormat.Segment(side: .mine, start: $0.start, settled: $0.settledText, pending: $0.pendingText) }
            rendering = try format.renderWhole(Composer.Transcript.merging(microphone, with: attributed.far), speakers: attributed.speakers)
        } else {
            let board = closedNames ?? names.snapshot()
            rendering = try format.renderWhole(
                Composer.Transcript.replacingMicrophone(in: state, with: segments, names: board),
                speakers: Composer.Transcript.speakers(board)
            )
        }
        try await file.replace(rendering.chunks, finalLength: rendering.finalLength)
    }

    /// Runs the after-call pass first, so confirmed names replace the live guesses before
    /// the file is sealed. A failed pass keeps the tentative names.
    func close() async {

        let board = names.snapshot()
        if let state = last, let track = board.callTrack, !board.spoken.isEmpty {
            do {
                let turns = try await diarizer.diarize(track).turns
                let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
                let confirmed = AfterCallNames.names(rows: rows, turns: turns, board: board)
                names.confirm(confirmed)
                await names.announce(confirmed)
                try await save(state)
                sink.write(.init(category: .session, message: "after-call names saved turns=\(turns.count)"))
            } catch {
                sink.write(.init(category: .session, message: "after-call names failed: \(error)"))
            }
        } else if let state = last, let track = board.callTrack {
            await attribute(state, track: track)
        }
        closedNames = names.snapshot()
        closed = true
        await file.close()
    }

    /// Gives the far side to its diarized speakers and saves it whole. A failed diarization
    /// or save keeps the far side as plain Them.
    private func attribute(_ state: CallState, track: URL) async {

        guard let pieces = await RemoteSpeakers(diarizer: diarizer, sink: sink).attribute(state, track: track, speakers: nil) else { return }
        let result = Composer.Transcript.attributed(pieces, in: state)
        let microphone = state.entries.filter { $0.speaker == .mine }.map { Composer.Transcript.segment(from: $0) }
        do {
            let rendering = try format.renderWhole(Composer.Transcript.merging(microphone, with: result.far), speakers: result.speakers)
            try await file.replace(rendering.chunks, finalLength: rendering.finalLength)
            attributed = result
            sink.write(.init(category: .session, message: "remote speakers saved speakers=\(result.speakers.count)"))
        } catch {
            sink.write(.init(category: .session, message: "remote speakers not saved: \(error)"))
        }
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
    private let diarizer: CallDiarizer
    /// `diarizer` runs the after-call pass over the call track.
    public init(diarizer: CallDiarizer) { self.diarizer = diarizer }
    public func open(at url: Foundation.URL, sink: any LogSink) async throws -> any SessionTranscriptFile {
        var format = TranscriptFormat()
        let initial = try format.render([])
        let file = try await TranscriptFile(url: url, initialBytes: initial.chunks, binding: DiskTranscriptBinding())
        // Opening has no live write revision; the first saved speaker block starts at one.
        return WritingTranscript(file: file, format: TranscriptFormat(), names: .shared, diarizer: diarizer, sink: sink)
    }
}
