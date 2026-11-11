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

private actor PassBytes: TranscriptBytes {
    private(set) var calls: [String] = []
    func write(_ chunks: [Data], finalLength: Int?) { calls.append("write") }
    func replace(_ chunks: [Data], finalLength: Int?) { calls.append("replace") }
    func close() { calls.append("close") }
}
