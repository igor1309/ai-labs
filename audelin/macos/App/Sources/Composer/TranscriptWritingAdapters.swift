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

/// The file operations a recording and its finalization use.
public protocol TranscriptWriter: Sendable {
    func write(_ state: CallState) async throws
    func close() async
    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) async throws
}

/// Open file handles and the pass that uses them; progress belongs to the finalization machine.
public struct OpenedTranscript: Sendable {
    let writer: any TranscriptWriter
    let pass: AfterCallPass
    let names: RecordingNames

    init(writer: any TranscriptWriter, pass: AfterCallPass, names: RecordingNames) {
        self.writer = writer; self.pass = pass; self.names = names
    }
}

struct PacedTextSaving<Value: Sendable>: TextSaving {

    let pacing: SavePacing<Value>

    func submit(_ text: Value) { pacing.submit(text) }
    func finish() async { await pacing.finish() }
}

struct TranscriptDestination: Saving {

    let pieces: SessionPieces

    func save(_ state: CallState) async throws { try await pieces.saveTranscript(state) }
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

actor WritingTranscript: TranscriptWriter, WholeTranscriptReplacing {

    let file: any TranscriptBytes
    let sink: any LogSink
    private let names: RecordingNames
    private var format: any TranscriptRenderer
    private var replaceNext = false
    private var closed = false
    init(file: any TranscriptBytes, format: any TranscriptRenderer, names: RecordingNames, sink: any LogSink) {
        self.file = file; self.format = format; self.names = names; self.sink = sink
    }

    /// Logs each save with the final count it wrote, so a reader of the log knows
    /// how many entries on disk will not change again.
    func write(_ state: CallState) async throws {

        guard !closed else { throw TranscriptFile.Failure.writingEnded }
        try await save(state)
    }

    private func save(_ state: CallState) async throws {

        let entries = state.entries, finalCount = state.finalCount
        let names = names.snapshot()
        let rendering: TranscriptFormat.Rendering
        do {
            rendering = try format.render(count: entries.count, finalCount: finalCount, speakers: Composer.Transcript.speakers(names)) {
                let entry = entries[$0]
                return Composer.Transcript.segment(from: entry, speaker: names.rowNames[entry.text.id].flatMap { names.participantIDs[$0] })
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

    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) async throws {

        let rendering = try format.renderWhole(segments, speakers: speakers)
        try await file.replace(rendering.chunks, finalLength: rendering.finalLength)
    }

    func close() async {

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
    func open(at url: Foundation.URL, names: RecordingNames, sink: any LogSink) async throws -> OpenedTranscript
}
public struct FileTranscriptStorage: TranscriptStorage {
    private let diarizer: any TranscriptDiarizer
    /// `diarizer` runs the after-call pass over the call track.
    public init(diarizer: any TranscriptDiarizer) { self.diarizer = diarizer }
    /// Opening starts the diarizer's model loading, so it downloads during the call.
    public func open(at url: Foundation.URL, names: RecordingNames, sink: any LogSink) async throws -> OpenedTranscript {
        await diarizer.prepare()
        var format = TranscriptFormat()
        let initial = try format.render([])
        let file = try await TranscriptFile(url: url, initialBytes: initial.chunks, binding: DiskTranscriptBinding())
        // Opening has no live write revision; the first saved speaker block starts at one.
        let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: names, sink: sink)
        let pass = AfterCallPass(writer: writer, track: url.deletingLastPathComponent().appendingPathComponent("call.caf"), names: names, diarizer: diarizer, sink: sink)
        return OpenedTranscript(writer: writer, pass: pass, names: names)
    }
}
