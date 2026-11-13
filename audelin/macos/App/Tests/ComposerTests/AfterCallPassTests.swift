import BlockingTestWork
import CallDiarizer
import Foundation
import LiveText
import Testing
import TranscriptFormat
@testable import CallText
@testable import Composer

/// After close, the transcript runs the after-call pass on the diarizer it was given.
@Suite(.timeLimit(.minutes(1)))
struct AfterCallPassTests {

    @Test func onlyAClosedFileIsDiarizedAndOnlyOnce() async throws {
        try await withCallTrack { track in
            let samples = Values<Int>()
            let binding = PassBinding(nemotron: {
                samples.append($0.count)
                return [0, 4, 8, 12].enumerated().map { EngineTurn(speaker: "\($0.offset % 2)", start: Double($0.element), end: Double($0.element + 4)) }
            })
            let (_, bytes, writer) = try await zoomWriter(track: track, binding: binding)
            #expect(await writer.attributeSpeakers() == nil)
            #expect(samples.all.isEmpty)
            await writer.close()
            let attributed = try #require(await writer.attributeSpeakers())
            #expect(attributed.speakers.map(\.id) == ["d0", "d1"])
            #expect(await writer.attributeSpeakers() == attributed)
            #expect(samples.all == [160])
            #expect(await bytes.calls == ["write", "close", "replace"])
        }
    }

    @Test func aZoomCallIsDiarizedOnceForBothItsNamesAndItsSpeakers() async throws {
        try await withCallTrack { track in
            let samples = Values<Int>()
            let binding = PassBinding(nemotron: {
                samples.append($0.count)
                return [0, 4, 8, 12].enumerated().map { EngineTurn(speaker: "\($0.offset % 2)", start: Double($0.element), end: Double($0.element + 4)) }
            })
            let (logs, bytes, writer) = try await zoomWriter(track: track, binding: binding)
            await writer.close()
            _ = await writer.attributeSpeakers()
            #expect(samples.all == [160])
            #expect(await bytes.calls == ["write", "close", "replace"])
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them 1** 00:00:00\nfar1\n\n**Them 2** 00:00:04\nfar2\n\n**Them 1** 00:00:08\nfar3\n"))
            #expect(text.contains("- Them 1: Anna\n- Them 2: Boris\n"))
            #expect(logs.all.map(\.message).contains("after-call names confirmed=2 turns=4"))
        }
    }

    @Test func aFailedPassOnAZoomCallKeepsTheTentativeNames() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in throw PassFailure() }, vbx: { throw PassFailure() })
            let (logs, bytes, writer) = try await zoomWriter(track: track, binding: binding)
            await writer.close()
            _ = await writer.attributeSpeakers()
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("remote speakers failed") })
            #expect(await bytes.calls == ["write", "close"])
            await #expect(throws: (any Error).self) { try await writer.write(.init(status: .finished, entries: [], finalCount: 0)) }
        }
    }

    @Test func aPassThatHearsNoOneKeepsTheLiveNamesTentative() async throws {
        try await withCallTrack { track in
            let names = LiveNameBoard()
            let (_, bytes, writer) = try await zoomWriter(track: track, binding: PassBinding(nemotron: { _ in [] }),
                                                          given: [1: "Anna", 2: "Boris"], names: names)
            await writer.close()
            #expect(await writer.attributeSpeakers() == nil)
            #expect(await bytes.calls == ["write", "close"])
            #expect(names.snapshot().rows == [1: "Anna", 2: "Boris"])
            #expect(!names.snapshot().confirmed)
        }
    }

    @Test func aZoomCallConfirmsItsRowNamesAndAnnouncesThem() async throws {
        try await withCallTrack { track in
            let names = LiveNameBoard()
            let heard = Values<[Int: String]>()
            names.listen { heard.append($0) }
            let (_, _, writer) = try await zoomWriter(track: track, binding: Self.alternating, names: names)
            await writer.close()
            _ = await writer.attributeSpeakers()
            let board = names.snapshot()
            #expect(board.rows == [1: "Anna", 2: "Boris", 3: "Anna"])
            #expect(board.confirmed)
            #expect(heard.all == [[1: "Anna", 2: "Boris", 3: "Anna"]])
        }
    }

    @Test func aFailedAttributedSaveStillWritesTheCorrectedNamesOnEveryRow() async throws {
        try await withCallTrack { track in
            let bytes = PassBytes(failingReplaces: 1)
            let (logs, _, writer) = try await zoomWriter(track: track, binding: Self.alternating, given: [1: "Boris", 2: "Anna", 3: "Boris"], bytes: bytes)
            await writer.close()
            let returned = try #require(await writer.attributeSpeakers())
            #expect(await bytes.calls == ["write", "close", "replace", "replace"])
            let ids = Dictionary(uniqueKeysWithValues: returned.speakers.map { ($0.name, $0.id) })
            #expect(returned.far.map(\.settled) == ["far1", "far2", "far3"])
            #expect(returned.far.map(\.speaker) == [ids["Anna"], ids["Boris"], ids["Anna"]])
            #expect(returned.speakers.map(\.state) == ["confirmed", "confirmed"])
            let text = try #require(await bytes.replaced.last)
            let anna = try #require(text.firstMatch(of: /- Them (\d): Anna/)?.1)
            let boris = try #require(text.firstMatch(of: /- Them (\d): Boris/)?.1)
            let offered = summaryEntries(.init(status: .finished, entries: [], finalCount: 0), attributed: returned)
            #expect(offered.map(\.label) == ["Them \(anna)", "Them \(boris)", "Them \(anna)"])
            #expect(text.contains("**Them \(anna)** 00:00:00\nfar1\n\n**Them \(boris)** 00:00:04\nfar2\n\n**Them \(anna)** 00:00:08\nfar3\n"))
            #expect(text.contains("\"state\":\"confirmed\""))
            #expect(!text.contains("tentative"))
            #expect(logs.all.map(\.message).contains("after-call names saved"))
        }
    }

    @Test func aFailedRenderingOnAZoomCallReplacesNothingAndCloses() async throws {
        try await withCallTrack { track in
            let (logs, bytes, writer) = try await zoomWriter(track: track, binding: Self.alternating, format: WholeFailingFormat())
            await writer.close()
            _ = await writer.attributeSpeakers()
            #expect(await bytes.calls == ["write", "close"])
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("after-call names not saved") })
        }
    }

    @Test func tentativeNamesSurviveAFailedDiarizationAndALaterRewrite() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in throw PassFailure() }, vbx: { throw PassFailure() })
            let names = LiveNameBoard()
            let (_, bytes, writer) = try await zoomWriter(track: track, binding: binding, given: [1: "Anna", 2: "Boris"], names: names)
            await writer.close()
            _ = await writer.attributeSpeakers()
            #expect(names.snapshot().rows == [1: "Anna", 2: "Boris"])
            let state = CallState(status: .finished, entries: .init(tail: [far(1, 0, 3), far(2, 4, 7), far(3, 8, 11)]), finalCount: 3)
            try await writer.replaceMicrophone(in: state, with: [])
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them 1** 00:00:00\nfar1\n\n**Them 2** 00:00:04\nfar2\n\n**Them** 00:00:08\nfar3\n"))
            #expect(text.contains("- Them 1: Anna\n- Them 2: Boris\n"))
            #expect(text.contains("\"state\":\"tentative\""))
        }
    }

    private static let alternating = PassBinding(nemotron: { _ in
        [0, 4, 8, 12].enumerated().map { EngineTurn(speaker: "\($0.offset % 2)", start: Double($0.element), end: Double($0.element + 4)) }
    })

    @Test func aCallWithoutZoomNamesGivesTheFarSideToItsSpeakers() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in
                [EngineTurn(speaker: "3", start: 0, end: 2), EngineTurn(speaker: "5", start: 2, end: 4), EngineTurn(speaker: "3", start: 4, end: 6)]
            })
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3), (3, 4, 5)])
            await writer.close()
            _ = await writer.attributeSpeakers()
            let text = try #require(await bytes.replaced.last)
            #expect(text.contains("**Them 1** 00:00:00\nfar1\n\n**Them 2** 00:00:02\nfar2\n\n**Them 1** 00:00:04\nfar3\n"))
            #expect(text.contains("- Them 1: unknown\n- Them 2: unknown\n"))
            #expect(await bytes.calls.suffix(2) == ["close", "replace"])
        }
    }

    @Test func savedSpeakersGiveEachRowItsPlaceAndAreReturnedAgainLater() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in
                [EngineTurn(speaker: "3", start: 0, end: 2), EngineTurn(speaker: "5", start: 2, end: 4), EngineTurn(speaker: "3", start: 4, end: 6)]
            })
            let (logs, _, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3), (3, 4, 5)])
            await writer.close()
            #expect(await writer.attributeSpeakers()?.rows == [1: 1, 2: 2, 3: 1])
            #expect(await writer.attributeSpeakers()?.rows == [1: 1, 2: 2, 3: 1])
            #expect(logs.all.filter { $0.message.hasPrefix("remote speakers model=") }.count == 1)
        }
    }

    @Test func unsavedSpeakersAreNotReturned() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 2), EngineTurn(speaker: "1", start: 2, end: 4)] })
            let (_, _, writer) = try await unnamedWriter(track: track, binding: binding, entries: [far(1, 0, 1), far(2, 2, 3)],
                                                         bytes: PassBytes(failingReplaces: 1))
            await writer.close()
            #expect(await writer.attributeSpeakers() == nil)
            #expect(await writer.attributeSpeakers() == nil)
        }
    }

    @Test func aLoneRemoteSpeakerStaysPlainThem() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 6)] })
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3)])
            await writer.close()
            _ = await writer.attributeSpeakers()
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
            _ = await writer.attributeSpeakers()
            #expect(await bytes.calls == ["write", "close"])
            #expect(logs.all.map(\.message).contains { $0.hasPrefix("remote speakers failed") })
        }
    }

    @Test func theMicrophoneReplacementKeepsTheAttributedFarSide() async throws {
        try await withCallTrack { track in
            let binding = PassBinding(nemotron: { _ in [EngineTurn(speaker: "0", start: 0, end: 2), EngineTurn(speaker: "1", start: 2, end: 4)] })
            let (_, bytes, writer) = try await unnamedWriter(track: track, binding: binding, theirs: [(1, 0, 1), (2, 2, 3)])
            await writer.close()
            _ = await writer.attributeSpeakers()
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
            let returned = try #require(await writer.attributeSpeakers())
            #expect(returned.far.map(\.settled) == ["far1", "a", "b"])
            #expect(returned.far.map(\.start) == [0, 2, 4])
            #expect(returned.far.map(\.filledInLater) == [true, true, true])
            #expect(returned.speakers.map(\.state) == ["diarized", "diarized"])
            let ids = returned.speakers.map(\.id)
            #expect(returned.far.map(\.speaker) == [ids.first, ids.first, ids.last])
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
            _ = await writer.attributeSpeakers()
            #expect(await bytes.calls == ["write", "close", "replace"])
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
            _ = await writer.attributeSpeakers()
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

    /// Anna and Boris take turns for four seconds each, as Zoom showed and the diarizer finds.
    private func zoomWriter(track: URL, binding: PassBinding, given: [Int: String] = [:],
                            format: any TranscriptRenderer = TranscriptFormat(), bytes: PassBytes = PassBytes(),
                            names: LiveNameBoard = LiveNameBoard()) async throws -> (Values<LogEntry>, PassBytes, WritingTranscript) {
        names.record(roster: ["Anna", "Boris"], spoken: [("Anna", 0, 4), ("Boris", 4, 8), ("Anna", 8, 12), ("Boris", 12, 16)], through: 30)
        names.callTrack(track)
        names.give(given)
        let logs = Values<LogEntry>()
        let writer = WritingTranscript(file: bytes, format: format, names: names,
                                       diarizer: CallDiarizer(binding: binding), sink: PassLog(entries: logs))
        let entries = [far(1, 0, 3), far(2, 4, 7), far(3, 8, 11)]
        try await writer.write(CallState(status: .finished, entries: .init(tail: entries), finalCount: entries.count))
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
