import CallAppProcesses
import CallDiarizer
import CallFolder
import CallNames
import Foundation
import Recording
import SessionRehearsal
import Testing
import TranscriptFormat
@testable import CallText
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct RecordingTranscriptOutputTests {
    @Test func transcriptReportsEverySaveOutcomeInOrder() async throws {
        try await withTranscriptPieces { rig in
            let pieces = rig.make(title: "first")
            let folder = try await pieces.create()
            try await pieces.openTranscript(in: folder)
            var output = rig.output.stream.makeAsyncIterator()
            #expect(await output.next() == .opened(call: folder.id))
            #expect(await rig.resources.resource(call: folder.id) != nil)
            let first = text("first"), second = text("second"), failed = text("unsaved")
            try await pieces.saveTranscript(first)
            try await pieces.saveTranscript(second)
            await rig.writer.failNextWrite()
            await #expect(throws: ScriptFailure.failed) { try await pieces.saveTranscript(failed) }
            try await pieces.closeTranscript()
            rig.output.continuation.finish()
            var remaining: [RecordingTranscript] = []
            while let value = await output.next() { remaining.append(value) }
            #expect(remaining == [.wrote(call: folder.id, first), .wrote(call: folder.id, second),
                                  .writeFailed(call: folder.id), .closed(call: folder.id, names: .init())])
            await rig.resources.published(call: folder.id)
        }
    }

    @Test func closedCarriesNamesAtFileClose() async throws {
        let closing = Signal(), close = Signal()
        defer { closing.end(); close.end() }
        try await withTranscriptPieces(writer: OutputWriter(closing: closing, close: close)) { rig in
            let pieces = rig.make(title: "named")
            let folder = try await pieces.create()
            try await pieces.openTranscript(in: folder)
            pieces.names.published(.init(roster: ["before close"]))
            let ending = Task { try await pieces.closeTranscript() }
            await closing.next()
            let atClose = CallNamesState(roster: ["at close"], rowNames: [2: "at close"])
            pieces.names.published(atClose)
            close.send()
            try await ending.value
            pieces.names.published(.init(roster: ["later"]))
            rig.output.continuation.finish()
            var received: [RecordingTranscript] = []
            for await value in rig.output.stream { received.append(value) }
            #expect(received == [.opened(call: folder.id), .closed(call: folder.id, names: atClose)])
            await rig.resources.published(call: folder.id)
        }
    }

    @Test func unopenedTranscriptReportsNothing() async throws {
        try await withTranscriptPieces(openFails: true) { rig in
            let pieces = rig.make(title: "unopened")
            let folder = try await pieces.create()
            await #expect(throws: ScriptFailure.failed) { try await pieces.openTranscript(in: folder) }
            try await pieces.saveTranscript(text("not saved"))
            try await pieces.closeTranscript()
            rig.output.continuation.finish()
            var received: [RecordingTranscript] = []
            for await value in rig.output.stream { received.append(value) }
            #expect(received.isEmpty)
            #expect(await rig.resources.resource(call: folder.id) == nil)
        }
    }

    @Test func successiveRecordingsShareOneOrderedOutput() async throws {
        try await withTranscriptPieces { rig in
            var expected: [RecordingTranscript] = []
            var calls: [String] = []
            for title in ["first", "second"] {
                let pieces = rig.make(title: title)
                let folder = try await pieces.create()
                calls.append(folder.id)
                try await pieces.openTranscript(in: folder)
                let saved = text(title)
                try await pieces.saveTranscript(saved)
                try await pieces.closeTranscript()
                expected += [.opened(call: folder.id), .wrote(call: folder.id, saved), .closed(call: folder.id, names: .init())]
            }
            #expect(calls[0] != calls[1])
            rig.output.continuation.finish()
            var received: [RecordingTranscript] = []
            for await value in rig.output.stream { received.append(value) }
            #expect(received == expected)
            for call in calls { await rig.resources.published(call: call) }
        }
    }
}

private func text(_ word: String) -> CallState {
    .init(status: .finished, entries: [.init(speaker: .mine,
        text: .init(id: 7, start: 1, end: 2, words: [.init(word, start: 1, end: 2)], settledCount: 1), writtenLater: false)], finalCount: 1)
}

private struct TranscriptPiecesRig: Sendable {
    let root: URL
    let boundary: ComposerBoundary
    let resources: FinalizationResources
    let writer: OutputWriter
    let output = AsyncStream<RecordingTranscript>.makeStream()

    func make(title: String) -> SessionPieces {
        SessionPieces(folder: CallFolder(callsURL: root, now: boundary.time.now, timeZone: .gmt,
                                        occupiedNames: { [] }, disk: .system), folderTitle: title,
                      processes: CallAppProcesses(app: "fixture", list: OutputProcesses()), boundary: boundary,
                      transcriptOutput: output.continuation, finalizationResources: resources)
    }
}

private func withTranscriptPieces(
    writer: OutputWriter = OutputWriter(), openFails: Bool = false,
    _ body: (TranscriptPiecesRig) async throws -> Void
) async throws {
    try await withComposeFolder { root in
        let clock = FixtureClock()
        defer { clock.finish() }
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { throw ScriptFailure.failed }, call: { _ in throw ScriptFailure.failed },
            mine: RehearsalRecognizer(SessionRecognizer(name: "mine")), theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
            now: clock.time.now, timeZone: { .gmt }, sleep: clock.sleep, intervals: testIntervals)
        boundary.transcripts = OutputStorage(writer: writer, fails: openFails)
        let rig = TranscriptPiecesRig(root: root, boundary: boundary, resources: await FinalizationResources(), writer: writer)
        defer { rig.output.continuation.finish() }
        try await body(rig)
    }
}

private struct OutputProcesses: ProcessList {
    func processes() -> [AudioProcess] { [] }
}

private struct OutputStorage: TranscriptStorage {
    let writer: OutputWriter
    let fails: Bool
    func open(at url: URL, names: RecordingNames, sink: any LogSink) throws -> OpenedTranscript {
        if fails { throw ScriptFailure.failed }
        return OpenedTranscript(writer: writer, pass: AfterCallPass(writer: writer, track: nil, names: names,
                                diarizer: CallDiarizer.unavailable, sink: sink), names: names)
    }
}

private actor OutputWriter: TranscriptWriter, WholeTranscriptReplacing {
    private var fails = false
    let closing: Signal?
    let closeGate: Signal?
    init(closing: Signal? = nil, close: Signal? = nil) { self.closing = closing; self.closeGate = close }
    func failNextWrite() { fails = true }
    func write(_ state: CallState) throws {
        if fails { fails = false; throw ScriptFailure.failed }
    }
    func close() async { closing?.send(); await closeGate?.next() }
    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) {}
}
