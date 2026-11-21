import BrowserBridge
import CallNames
import Foundation
import LiveText
import Observation
import PanelUI
import Recording
import SpeakerNaming
import Testing
@testable import CallText
@testable import Composer

/// The after-call pass's speaker turns reach the panel through the recording's names:
/// a row named live from the call app's evidence shows its confirmed name.
@Suite(.timeLimit(.minutes(1)))
struct AfterCallNamesWiringTests {

    @MainActor
    @Test func diarizedTurnsConfirmTheRowNameWhileReading() async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel(), names = RecordingNames()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) }, zoomName: unknownZoomName)
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, names: names, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording))
        await panel.namesSessionChanged(id: 1, phase: .recording, hasTranscript: true)
        clock.advance(20)
        try await speakInTurns(channel.connect())

        var round = 0
        text.continuation.yield(remote(round))
        var delivered = false
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, let row = lines.entries.first else { continue }
            if row.label == "Анна", !row.labelIsTentative { break }
            if row.label == "Анна", !delivered {
                delivered = true
                await names.diarized(turns, rows: [Row(id: 1, start: 0, end: 4)])
            } else if !delivered {
                round += 1
                text.continuation.yield(remote(round))
            }
        }
        text.continuation.finish()
        await reading.end()
        await panel.end(id: 1)
        clock.finish()
    }

    @MainActor
    @Test func diarizedTurnsAfterTheCallEndsConfirmTheFinishedCall() async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel(), names = RecordingNames()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) }, zoomName: unknownZoomName)
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, names: names, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording))
        await panel.namesSessionChanged(id: 1, phase: .recording, hasTranscript: true)
        clock.advance(20)
        try await speakInTurns(channel.connect())

        var round = 0
        text.continuation.yield(remote(round))
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, let row = lines.entries.first else { continue }
            if row.label == "Анна" { break }
            round += 1
            text.continuation.yield(remote(round))
        }
        text.continuation.finish()
        await reading.end()
        await panel.end(id: 1)
        clock.finish()

        // The pass runs during finalization, after the panel has ended the reading.
        await names.diarized(turns, rows: [Row(id: 1, start: 0, end: 4)])
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, let row = lines.entries.first else { continue }
            if row.label == "Анна", !row.labelIsTentative { break }
        }
    }

    @MainActor
    @Test func confirmationReachesOnlyTheFinishedCallsNamesPort() async throws {
        let app = ApplicationCallNames(now: { 40 }, makeWatch: { _ in .init(sources: []) })
        let first = RecordingNames(), second = RecordingNames()
        let firstChanges = AsyncStream<CallNamesState>.makeStream()
        let secondChanges = AsyncStream<CallNamesState>.makeStream()
        defer {
            firstChanges.continuation.finish()
            secondChanges.continuation.finish()
            app.send(.finalized(1))
            app.send(.finalized(2))
        }
        let row = Row(id: 1, start: 0, end: 4)
        func start(_ id: UInt64, _ names: RecordingNames, speaker: String, at: Double,
                   output: AsyncStream<CallNamesState>.Continuation) {
            app.open(id: id, published: names) { output.yield($0) }
            app.sessionChanged(id: id, phase: .recording, hasTranscript: true, at: at)
            app.send(.update(id, .zoom(.started(speaker), at: 0)))
            app.send(.update(id, .zoom(.observed, at: 10)))
            app.send(.update(id, .rows([row], now: at + 10)))
        }

        start(1, first, speaker: "Анна", at: 0, output: firstChanges.continuation)
        var firstSeen = firstChanges.stream.makeAsyncIterator()
        _ = await firstSeen.next()
        try #require(await firstSeen.next()?.rowNames == [1: "Анна"])
        app.sessionChanged(id: 1, phase: .ended, hasTranscript: true, at: 15)

        start(2, second, speaker: "Борис", at: 20, output: secondChanges.continuation)
        var secondSeen = secondChanges.stream.makeAsyncIterator()
        _ = await secondSeen.next()
        try #require(await secondSeen.next()?.rowNames == [1: "Борис"])
        let secondBeforeConfirmation = second.snapshot()

        await first.diarized([.init(speaker: 0, start: 0, end: 4), .init(speaker: 0, start: 5, end: 9)], rows: [row])
        await first.finalizationEnded()
        let confirmed = try #require(await firstSeen.next())
        #expect(confirmed.confirmed && confirmed.rowNames == [1: "Анна"])
        #expect(first.snapshot().confirmed)
        #expect(second.snapshot() == secondBeforeConfirmation)
    }

    @MainActor
    @Test func sessionEndReleasesNamesWhenNoTranscriptOpened() async {
        let app = ApplicationCallNames(now: { 10 }, makeWatch: { _ in .init(sources: []) })
        let names = RecordingNames()
        app.open(id: 1, published: names, show: { _ in })
        for await observation in Observations({ app.observation(of: 1) }) where observation == .observing { break }

        app.sessionChanged(id: 1, phase: .ended, hasTranscript: false, at: 10)
        for await observation in Observations({ app.observation(of: 1) }) where observation == nil { break }
        #expect(app.observation(of: 1) == nil)
    }

}

/// The browser's clock reads 100 s at call time 20 s; Анна and Борис take turns
/// over the call's first 16 s.
private func speakInTurns(_ peer: FakeBrowserPeer) async throws {
    var sent = peer.sent.makeAsyncIterator()
    #expect(await sent.next() == BrowserClockReply.ping(0))
    peer.send(#"{"version":1,"ping":0,"at":100000}"#)
    peer.send(browserMessage(0, #"{"type":"roster","at":79000,"participants":[{"id":"t1","name":"Анна","isSelf":false},{"id":"t2","name":"Борис","isSelf":false}]}"#))
    var sequence = 1
    for (index, start) in [80, 84, 88, 92].enumerated() {
        let id = index % 2 == 0 ? "t1" : "t2"
        peer.send(browserMessage(sequence, #"{"type":"speakingStarted","at":\#(start * 1000),"participantId":"\#(id)"}"#))
        peer.send(browserMessage(sequence + 1, #"{"type":"speakingStopped","at":\#((start + 4) * 1000),"participantId":"\#(id)"}"#))
        sequence += 2
    }
}

/// The pass's turns: speaker 0 where Анна spoke, speaker 1 where Борис did.
private let turns = [0, 4, 8, 12].enumerated().map {
    DiarizedTurn(speaker: $0.offset % 2, start: Double($0.element), end: Double($0.element + 4))
}

/// A remote row spoken over the call's first 4 s, while Анна spoke;
/// `round` changes its pending word so each text is new.
private func remote(_ round: Int) -> CallState {
    let entry = CallState.Entry(speaker: .theirs, text: .init(id: 1, start: 0, end: 4, words: [
        .init("привет", start: 0, end: 2), .init("w\(round)", start: 2, end: 4),
    ], settledCount: 1), writtenLater: false)
    return .init(status: .listening, entries: .init(tail: [entry]), finalCount: 0)
}
