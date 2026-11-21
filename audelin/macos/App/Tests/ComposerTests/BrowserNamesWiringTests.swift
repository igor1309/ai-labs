import BrowserBridge
import CallNames
import Foundation
import Synchronization
import LiveText
import PanelUI
import Recording
import Testing
@testable import CallText
@testable import Composer

/// The panel watches the shared browser channel for a recording and names a remote row
/// from what the extension reports; without the channel the row stays unnamed.
@Suite(.timeLimit(.minutes(1)))
struct BrowserNamesWiringTests {

    @MainActor
    @Test func theNextRecordingUsesTheSameListenerAndItsOwnClock() async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel(), log = FixtureLog()
        defer { clock.finish() }
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: log, intervals: testIntervals,
                                 browser: { channel.open() }, sleep: clock.sleep, zoomName: unknownZoomName)
        let firstText = AsyncStream<CallState>.makeStream()
        let first = await panel.begin(id: 1, text: firstText.stream, enableLiveText: {})
        first.sessionChanged(SessionState(phase: .recording), at: 0)
        panel.names.sessionChanged(id: 1, phase: .recording, hasTranscript: true, at: 0)
        clock.advance(8)
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        try #require(await sent.next() == BrowserClockReply.ping(0))
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        peer.send(browserMessage(0, #"{"type":"roster","at":99000,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#))
        await log.wait { $0.category == .browser && $0.message.contains("sequence=0 time=7.0 roster") }

        let secondText = AsyncStream<CallState>.makeStream(), names = RecordingNames()
        let second = await panel.begin(id: 2, text: secondText.stream, names: names, enableLiveText: {})
        for await state in names.states() where state.browserConnections == [0] { break }
        #expect(names.snapshot().recordingStart == nil)

        // A disconnect follows every report from this peer, so it also observes
        // the result of processing those reports while the second clock is off.
        let probe = channel.connect()
        var probePings = probe.sent.makeAsyncIterator()
        try #require(await probePings.next() == BrowserClockReply.ping(0))
        probe.send(#"{"version":1,"ping":0,"at":100000}"#)
        for await state in names.states() where state.browserConnections == [0, 1] { break }
        probe.send(browserMessage(0, #"{"type":"roster","at":100000,"participants":[{"id":"t2","name":"Борис","isSelf":false}]}"#))
        probe.framesIn.finish()
        for await state in names.states() where state.browserConnections == [0] { break }
        #expect(names.snapshot().browser.members.isEmpty)

        firstText.continuation.finish()
        await first.end()
        clock.advance(1)
        second.sessionChanged(SessionState(phase: .recording), at: 9)
        panel.names.sessionChanged(id: 2, phase: .recording, hasTranscript: true, at: 9)
        for await state in names.states() where state.recordingStart == 9 { break }
        clock.advance(7)
        peer.send(browserMessage(1, #"{"type":"speakingStarted","at":103000,"participantId":"t1"}"#))
        peer.send(browserMessage(2, #"{"type":"speakingStopped","at":106000,"participantId":"t1"}"#))
        for await state in names.states() where state.browser.through == 5 { break }
        #expect(names.snapshot().browser.intervals.map(\.start) == [2])
        secondText.continuation.yield(remote(0, start: 3))
        for await state in names.states() where state.rowNames[1] == "Анна" { break }
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, let row = lines.entries.first, row.label == "Анна" else { continue }
            #expect(row.labelIsTentative)
            break
        }
        #expect(channel.opens == 1)
        #expect(!channel.stopped)
        secondText.continuation.finish()
        await second.end()
        await panel.end(id: 2)
    }

    @MainActor
    @Test func aConnectedExtensionNamesTheRemoteRow() async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) }, zoomName: unknownZoomName)
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording), at: clock.time.monotonicNow())
        panel.names.sessionChanged(id: 1, phase: .recording, hasTranscript: true, at: clock.time.monotonicNow())
        clock.advance(20)

        // The browser's clock reads 100 s at call time 20 s.
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        #expect(await sent.next() == BrowserClockReply.ping(0))
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        peer.send(browserMessage(0, #"{"type":"roster","at":89000,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#))
        peer.send(browserMessage(1, #"{"type":"speakingStarted","at":90000,"participantId":"t1"}"#))
        peer.send(browserMessage(2, #"{"type":"speakingStopped","at":94000,"participantId":"t1"}"#))

        // The row may come before the extension's reports are read; each new
        // text asks for its name again.
        var round = 0
        text.continuation.yield(remote(round))
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, let row = lines.entries.first else { continue }
            if row.label == "Анна" { #expect(row.labelIsTentative); break }
            round += 1
            text.continuation.yield(remote(round))
        }
        text.continuation.finish()
        await reading.end()
        await panel.end(id: 1)
        #expect(!channel.stopped)
        clock.finish()
    }

    @MainActor
    @Test func withoutTheChannelTheRemoteRowStaysUnnamed() async throws {
        let clock = FixtureClock()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { nil }, sleep: { _ in }, zoomName: unknownZoomName)
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording), at: clock.time.monotonicNow())
        panel.names.sessionChanged(id: 1, phase: .recording, hasTranscript: true, at: clock.time.monotonicNow())
        clock.advance(20)
        text.continuation.yield(remote(0))
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, let row = lines.entries.first else { continue }
            #expect(row.label == nil)
            break
        }
        text.continuation.finish()
        await reading.end()
        await panel.end(id: 1)
        clock.finish()
    }
}

/// A remote row spoken from 11 s to 12 s of the call, still being recognised;
/// `round` changes its pending word so each text is new.
private func remote(_ round: Int, start: Double = 11) -> CallState {
    let entry = CallState.Entry(speaker: .theirs, text: .init(id: 1, start: start, end: start + 1, words: [
        .init("привет", start: start, end: start + 0.5), .init("w\(round)", start: start + 0.5, end: start + 1),
    ], settledCount: 1), writtenLater: false)
    return .init(status: .listening, entries: .init(tail: [entry]), finalCount: 0)
}
