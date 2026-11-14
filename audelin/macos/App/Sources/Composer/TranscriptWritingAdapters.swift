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

actor WritingTranscript: WholeTranscriptReplacing {

    let file: any TranscriptBytes
    let sink: any LogSink
    private let names: LiveNameBoard
    private var format: any TranscriptRenderer
    private var replaceNext = false
    private var closed = false
    init(file: any TranscriptBytes, format: any TranscriptRenderer, names: LiveNameBoard, sink: any LogSink) {
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
        let names = LiveNameBoard.shared
        let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: names, sink: sink)
        let pass = AfterCallPass(writer: writer, names: names, diarizer: diarizer, sink: sink)
        return ClosingTranscript(call: url.path, writer: writer, pass: pass, names: names)
    }
}
