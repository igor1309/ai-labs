import BlockingTestWork
import CallDiarizer
import Foundation
import LiveText
import Testing
import TranscriptFormat
@testable import CallText
@testable import Composer

/// The transcript's close runs the after-call pass on the diarizer it was given.
@Suite(.timeLimit(.minutes(1)))
struct AfterCallPassTests {

    @Test func closeDiarizesTheCallTrackWithTheGivenDiarizer() async throws {
        try await withCallTrack { track in
            let samples = Values<Int>()
            let binding = PassBinding(nemotron: {
                samples.append($0.count)
                return [EngineTurn(speaker: "0", start: 0, end: 1)]
            })
            let (logs, bytes, writer) = try await closedWriter(track: track, binding: binding)
            await writer.close()
            #expect(samples.all == [160])
            #expect(await bytes.calls == ["write", "write", "close"])
            #expect(logs.all.map(\.message).contains("after-call names saved turns=1"))
        }
    }

    @Test func aFailedPassKeepsTheFileAndLogsTheFailure() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in throw PassFailure() }, vbx: { throw PassFailure() })
            let (logs, bytes, writer) = try await closedWriter(track: track, binding: binding)
            await writer.close()
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("after-call names failed") })
            #expect(await bytes.calls == ["write", "close"])
            await #expect(throws: (any Error).self) { try await writer.write(.init(status: .finished, entries: [], finalCount: 0)) }
        }
    }

    @Test func aCallWithoutZoomNamesGivesTheFarSideToItsSpeakers() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in
                [EngineTurn(speaker: "3", start: 0, end: 2), EngineTurn(speaker: "5", start: 2, end: 4), EngineTurn(speaker: "3", start: 4, end: 6)]
            })
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3), (3, 4, 5)])
            await writer.close()
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them 1** 00:00:00\nfar1\n\n**Them 2** 00:00:02\nfar2\n\n**Them 1** 00:00:04\nfar3\n"))
            #expect(text.contains("- Them 1: unknown\n- Them 2: unknown\n"))
            #expect(await bytes.calls.suffix(2) == ["replace", "close"])
        }
    }

    @Test func aLoneRemoteSpeakerStaysPlainThem() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 6)] })
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3)])
            await writer.close()
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them** 00:00:00\nfar1\n\n**Them** 00:00:02\nfar2\n"))
            #expect(!text.contains("Them 1"))
        }
    }

    @Test func aFailedDiarizationKeepsPlainThemUnreplaced() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in throw PassFailure() }, vbx: { throw PassFailure() })
            let (logs, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1)])
            await writer.close()
            #expect(await bytes.calls == ["write", "close"])
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("remote speakers failed") })
        }
    }

    @Test func theMicrophoneReplacementKeepsTheAttributedFarSide() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 2), EngineTurn(speaker: "1", start: 2, end: 4)] })
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3)])
            await writer.close()
            let state = CallState(status: .finished, entries: [], finalCount: 0)
            try await writer.replaceMicrophone(in: state, with: [.init(id: 9, start: 1, end: 2, words: [.init("mine", start: 1, end: 2)], settledCount: 1)])
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them 1** 00:00:00\nfar1\n\n**Me** 00:00:01\nmine\n\n**Them 2** 00:00:02\nfar2\n"))
        }
    }

    @Test func closeKeepsTheMicrophoneAndEveryPieceOfALateSegmentMarked() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 3), EngineTurn(speaker: "1", start: 3, end: 6)] })
            let split = CallState.Entry(speaker: .theirs, text: .init(id: 2, start: 2, end: 6, words: [
                .init("a", start: 2, end: 3), .init("b", start: 4, end: 5),
            ], settledCount: 2), writtenLater: true)
            let entries = [far(1, 0, 1, later: true), mine(10, 1, 1.5), split]
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, entries: entries)
            await writer.close()
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("""
                **Them 1** 00:00:00 (filled in later)
                far1

                **Me** 00:00:01
                me10

                **Them 1** 00:00:02 (filled in later)
                a

                **Them 2** 00:00:04 (filled in later)
                b

                """))
        }
    }

    @Test func aFailedSaveKeepsPlainThemForLaterReplacements() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 2), EngineTurn(speaker: "1", start: 2, end: 4)] })
            let bytes = PassBytes(failingReplaces: 1)
            let (logs, _, writer) = try await unnamedWriter(track: track, binding: binding, entries: [far(1, 0, 1), far(2, 2, 3)], bytes: bytes)
            await writer.close()
            #expect(await bytes.calls == ["write", "replace", "close"])
            #expect(await bytes.replaced.isEmpty)
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("remote speakers not saved") })
            let state = CallState(status: .finished, entries: .init(tail: [far(1, 0, 1), far(2, 2, 3)]), finalCount: 2)
            try await writer.replaceMicrophone(in: state, with: [])
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them** 00:00:00\nfar1\n\n**Them** 00:00:02\nfar2\n"))
        }
    }

    @Test func aFailedRenderingReplacesNothing() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 2), EngineTurn(speaker: "1", start: 2, end: 4)] })
            let (logs, bytes, writer) = try await unnamedWriter(track: track, binding: binding, entries: [far(1, 0, 1), far(2, 2, 3)],
                                                                format: WholeFailingFormat())
            await writer.close()
            #expect(await bytes.calls == ["write", "close"])
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("remote speakers not saved") })
        }
    }

    private func far(_ id: Int, _ start: Double, _ end: Double, later: Bool = false) -> CallState.Entry {
        .init(speaker: .theirs, text: .init(id: id, start: start, end: end, words: [.init("far\(id)", start: start, end: end)], settledCount: 1),
              writtenLater: later)
    }

    private func mine(_ id: Int, _ start: Double, _ end: Double) -> CallState.Entry {
        .init(speaker: .mine, text: .init(id: id, start: start, end: end, words: [.init("me\(id)", start: start, end: end)], settledCount: 1),
              writtenLater: false)
    }

    private func unnamedWriter(track: URL, binding: PassBinding, theirs: [(id: Int, start: Double, end: Double)])
        async throws -> (Values<LogEntry>, PassBytes, WritingTranscript) {
        try await unnamedWriter(track: track, binding: binding, entries: theirs.map { far($0.id, $0.start, $0.end) })
    }

    private func unnamedWriter(track: URL, binding: PassBinding, entries: [CallState.Entry],
                               format: any TranscriptRenderer = TranscriptFormat(), bytes: PassBytes = PassBytes())
        async throws -> (Values<LogEntry>, PassBytes, WritingTranscript) {
        let names = LiveNameBoard()
        names.callTrack(track)
        let logs = Values<LogEntry>()
        let writer = WritingTranscript(file: bytes, format: format, names: names,
                                       diarizer: CallDiarizer(binding: binding), sink: PassLog(entries: logs))
        try await writer.write(CallState(status: .finished, entries: .init(tail: entries), finalCount: entries.count))
        return (logs, bytes, writer)
    }

    private func closedWriter(track: URL, binding: PassBinding) async throws -> (Values<LogEntry>, PassBytes, WritingTranscript) {
        let names = LiveNameBoard()
        names.record(roster: ["Anna"], spoken: [(name: "Anna", start: 0, end: 1)], through: 1)
        names.callTrack(track)
        let logs = Values<LogEntry>()
        let bytes = PassBytes()
        let writer = WritingTranscript(file: bytes, format: TranscriptFormat(), names: names,
                                       diarizer: CallDiarizer(binding: binding), sink: PassLog(entries: logs))
        let state = CallState(status: .finished, entries: [
            .init(speaker: .theirs, text: .init(id: 1, start: 0, end: 1, words: [.init("hello", start: 0, end: 1)], settledCount: 1), writtenLater: false),
        ], finalCount: 1)
        try await writer.write(state)
        return (logs, bytes, writer)
    }
}

private struct PassBinding: DiarizationBinding {
    var nemotron: @Sendable ([Float]) async throws -> [EngineTurn]
    var vbx: @Sendable () async throws -> [EngineTurn] = { [] }
    var nemotronSlots: Int { 8 }
    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] { nemotron }
    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] { try await vbx() }
}

private struct PassFailure: Error {}

private struct PassLog: LogSink {
    let entries: Values<LogEntry>
    func write(_ entry: LogEntry) { entries.append(entry) }
}

/// The real format for live saves; every whole rendering fails.
private struct WholeFailingFormat: TranscriptRenderer {
    var live = TranscriptFormat()
    mutating func render(count: Int, finalCount: Int, speakers: [TranscriptFormat.Speaker], segment: (Int) -> TranscriptFormat.Segment) throws -> TranscriptFormat.Rendering {
        try live.render(count: count, finalCount: finalCount, speakers: speakers, segment: segment)
    }
    func renderWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) throws -> TranscriptFormat.Rendering {
        throw TranscriptFormat.Failure.invalidStart
    }
}

private actor PassBytes: TranscriptBytes {
    private var failingReplaces: Int
    init(failingReplaces: Int = 0) { self.failingReplaces = failingReplaces }
    private(set) var calls: [String] = []
    private(set) var replaced: [String] = []
    func write(_ chunks: [Data], finalLength: Int?) { calls.append("write") }
    func replace(_ chunks: [Data], finalLength: Int?) throws {
        calls.append("replace")
        if failingReplaces > 0 { failingReplaces -= 1; throw PassFailure() }
        replaced.append(String(decoding: chunks.reduce(Data(), +), as: UTF8.self))
    }
    func close() { calls.append("close") }
}
