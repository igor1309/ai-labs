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

    /// After close: gives the far side to its diarized speakers and saves it in the file;
    /// nil when there is no call track or the pass failed. The pass runs once; a later call
    /// returns its result.
    func attributeSpeakers() async -> AttributedFar?

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
    /// The after-call pass runs once; a later call returns what it saved.
    private var passed = false

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

    func close() async {

        closedNames = names.snapshot()
        closed = true
        await file.close()
    }

    /// One diarization of the call track gives the far side to its speakers and, on a Zoom
    /// call, confirms the names Zoom showed. A failed diarization keeps the far side as plain
    /// Them and Zoom's names tentative.
    func attributeSpeakers() async -> Composer.Transcript.Attributed? {

        guard attributed == nil else { return attributed }
        let board = names.snapshot()
        guard closed, !passed, let state = last, let track = board.callTrack else { return nil }
        passed = true
        await afterCall(state, track: track, board: board)
        closedNames = names.snapshot()
        return attributed
    }

    private func afterCall(_ state: CallState, track: URL, board: LiveNameBoard.Names) async {

        let zoom = !board.spoken.isEmpty
        guard let result = await RemoteSpeakers(diarizer: diarizer, sink: sink).attribute(state, track: track, speakers: nil) else { return }
        // A pass that heard no one has nothing to confirm or attribute: the live names stay tentative.
        guard !result.turns.isEmpty else { return }
        var clusters: [Int: String] = [:]
        if zoom {
            let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
            let confirmed = AfterCallNames.names(rows: rows, turns: result.turns, board: board)
            names.confirm(confirmed)
            await names.announce(confirmed)
            clusters = AfterCallNames.clusterNames(turns: result.turns, board: board)
            sink.write(.init(category: .session, message: "after-call names confirmed=\(clusters.count) turns=\(result.turns.count)"))
        }
        var attributed = Composer.Transcript.attributed(result.pieces, in: state, names: clusters)
        let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
        attributed.rows = Composer.Transcript.rowSpeakers(rows: rows, turns: result.turns, speakers: attributed.speakers)
        let microphone = state.entries.filter { $0.speaker == .mine }.map { Composer.Transcript.segment(from: $0) }
        do {
            let rendering = try format.renderWhole(Composer.Transcript.merging(microphone, with: attributed.far), speakers: attributed.speakers)
            try await file.replace(rendering.chunks, finalLength: rendering.finalLength)
            self.attributed = attributed
            sink.write(.init(category: .session, message: "remote speakers saved speakers=\(attributed.speakers.count)"))
        } catch {
            sink.write(.init(category: .session, message: "remote speakers not saved: \(error)"))
            if zoom { await saveConfirmedNames(state) }
        }
    }

    /// Without the attributed far side, the confirmed names still reach the file on the
    /// call's own rows, rendered afresh so rows already final take their corrected names.
    /// Once saved, those rows are the far side the pass returns.
    private func saveConfirmedNames(_ state: CallState) async {

        let board = names.snapshot()
        let rows = state.entries.map { entry in
            Composer.Transcript.segment(from: entry, speaker: board.rows[entry.text.id].flatMap { board.ids[$0] })
        }
        let speakers = Composer.Transcript.speakers(board)
        do {
            let rendering = try format.renderWhole(rows, speakers: speakers)
            try await file.replace(rendering.chunks, finalLength: rendering.finalLength)
            // What the file now holds is the far side later readers and replacements take.
            attributed = .init(far: rows.filter { $0.side == .theirs }, speakers: speakers)
            sink.write(.init(category: .session, message: "after-call names saved"))
        } catch {
            sink.write(.init(category: .session, message: "after-call names not saved: \(error)"))
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
    /// Opening starts the diarizer's model loading, so it downloads during the call.
    public func open(at url: Foundation.URL, sink: any LogSink) async throws -> any SessionTranscriptFile {
        await diarizer.prepare()
        var format = TranscriptFormat()
        let initial = try format.render([])
        let file = try await TranscriptFile(url: url, initialBytes: initial.chunks, binding: DiskTranscriptBinding())
        // Opening has no live write revision; the first saved speaker block starts at one.
        return WritingTranscript(file: file, format: TranscriptFormat(), names: .shared, diarizer: diarizer, sink: sink)
    }
}
