import AVFoundation
import BlockingTestWork
import CallDiarizer
import Foundation
import LiveText
import SpeakerAttribution
import Testing
@testable import CallText
@testable import Composer

struct RemoteSpeakersTests {
    @Test(arguments: [false, true])
    func onlyTheFarSideIsAttributedInTrackTime(usingVBx: Bool) async throws {
        try await withCallTrack { track in
            let turns = [
                EngineTurn(speaker: "4", start: 10, end: 14), EngineTurn(speaker: "9", start: 14, end: 18),
                EngineTurn(speaker: "12", start: 30, end: 34),
            ]
            let binding = RemoteBinding(
                nemotron: { samples in
                    #expect(!samples.isEmpty)
                    #expect(!usingVBx)
                    return turns
                },
                vbx: { samples, speakers in
                    #expect(!samples.isEmpty)
                    #expect(usingVBx)
                    #expect(speakers == 9)
                    return turns
                }
            )
            let logs = Values<LogEntry>()
            let pass = RemoteSpeakers(diarizer: CallDiarizer(binding: binding), sink: RemoteLog(entries: logs))
            let words = [
                Word("one", start: 10, end: 11), Word("two", start: 12, end: 13),
                Word("three", start: 14, end: 15), Word("four", start: 16, end: 17),
            ]
            let remote = TranscriptSegment(id: 7, start: 9, end: 18, words: words, settledCount: 3)
            let whole = TranscriptSegment(id: 8, start: 19, end: 20, words: [.init("last", start: 19, end: 20)], settledCount: 1)
            let mine = TranscriptSegment(id: 7, start: 9, end: 18, words: [.init("microphone", start: 10, end: 17)], settledCount: 1)
            let state = CallState(status: .finished, entries: [
                .init(speaker: .mine, text: mine, writtenLater: false),
                .init(speaker: .theirs, text: remote, writtenLater: false),
                .init(speaker: .theirs, text: whole, writtenLater: false),
            ], finalCount: 3)
            let pieces = await pass.attribute(state, track: track, speakers: usingVBx ? 9 : 2)?.pieces
            // VBx numbers names in encounter order; Nemotron keeps its numbers.
            let first = usingVBx ? 0 : 4, second = usingVBx ? 1 : 9
            #expect(pieces == [
                .init(segment: TranscriptSegment(id: 7, start: 9, end: 14, words: Array(words[0..<2]), settledCount: 2), speaker: first),
                .init(segment: TranscriptSegment(id: 7, start: 14, end: 18, words: Array(words[2..<4]), settledCount: 1), speaker: second),
                .init(segment: whole, speaker: second),
            ])
            let model = usingVBx ? "vbx" : "nemotron"
            #expect(logs.all == [.init(category: .session, message: "remote speakers model=\(model) turns=3 speakers=2")])
        }
    }

    @Test func bothModelsFailingKeepsTheFarSidePlainAndLogsTheFailure() async throws {
        try await withCallTrack { track in
            let calls = Values<String>(), logs = Values<LogEntry>()
            let binding = RemoteBinding(
                nemotron: { _ in calls.append("nemotron"); throw RemoteFailure() },
                vbx: { _, _ in calls.append("vbx"); throw RemoteFailure() }
            )
            let pass = RemoteSpeakers(diarizer: CallDiarizer(binding: binding), sink: RemoteLog(entries: logs))
            let state = CallState(status: .finished, entries: [
                .init(speaker: .theirs, text: .init(id: 1, start: 0, end: 1, words: [.init("hello", start: 0, end: 1)], settledCount: 1), writtenLater: false),
            ], finalCount: 1)
            #expect(await pass.attribute(state, track: track, speakers: nil) == nil)
            #expect(calls.all == ["nemotron", "vbx"])
            #expect(logs.all == [.init(category: .session, message: "remote speakers failed: unavailable")])
        }
    }

    /// The pass is cancelled while the diarizer runs; the diarizer then answers or fails.
    @Test(arguments: [false, true])
    func cancellationKeepsTheFarSidePlainWithoutAFailureLine(diarizerFails: Bool) async throws {
        try await withCallTrack { track in
            let logs = Values<LogEntry>()
            let entered = AsyncStream<Void>.makeStream(), release = AsyncStream<Void>.makeStream()
            let binding = RemoteBinding(
                nemotron: { _ in
                    entered.continuation.yield()
                    for await _ in release.stream { break }
                    if diarizerFails { throw RemoteFailure() }
                    return [EngineTurn(speaker: "1", start: 0, end: 0.01)]
                },
                vbx: { _, _ in throw RemoteFailure() }
            )
            let pass = RemoteSpeakers(diarizer: CallDiarizer(binding: binding), sink: RemoteLog(entries: logs))
            let state = CallState(status: .finished, entries: [
                .init(speaker: .theirs, text: .init(id: 1, start: 0, end: 0.01, words: [.init("hi", start: 0, end: 0.01)], settledCount: 1), writtenLater: false),
            ], finalCount: 1)
            let task = Task { await pass.attribute(state, track: track, speakers: nil) }
            for await _ in entered.stream { break }

            task.cancel()
            release.continuation.yield()

            #expect(await task.value == nil)
            #expect(logs.all.isEmpty)
        }
    }
}

private struct RemoteBinding: DiarizationBinding {
    let nemotron: @Sendable ([Float]) async throws -> [EngineTurn]
    let vbx: @Sendable ([Float], Int?) async throws -> [EngineTurn]
    var nemotronSlots: Int { 8 }
    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] { nemotron }
    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] { try await vbx(samples, speakers) }
}

private struct RemoteFailure: Error, CustomStringConvertible {
    var description: String { "unavailable" }
}

private struct RemoteLog: LogSink {
    let entries: Values<LogEntry>
    func write(_ entry: LogEntry) { entries.append(entry) }
}

