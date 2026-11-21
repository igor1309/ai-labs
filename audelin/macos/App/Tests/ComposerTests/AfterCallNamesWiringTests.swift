import BrowserBridge
import CallNames
import Foundation
import LiveText
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
    @Test func turnsReportedEarlyConfirmTheRowAfterTheWatchCloses() async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel(), names = RecordingNames()
        defer { clock.finish() }
        let panel = makeAudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) }, zoomName: unknownZoomName)
        let text = AsyncStream<CallState>.makeStream()
        panel.begin(id: 1, text: text.stream, names: names)
        panel.sessionChanged(id: 1, SessionState(phase: .recording), at: clock.time.monotonicNow())
        clock.advance(20)
        try await speakInTurns(channel.connect(), to: names)
        text.continuation.yield(remote())
        try #require(await panel.states().first { @Sendable in annaRow(in: $0)?.labelIsTentative == true } != nil)

        #expect(names.snapshot().observation == .observing)
        await names.diarized(turns, rows: [Row(id: 1, start: 0, end: 4)])
        panel.sessionChanged(id: 1, .init(phase: .ended, transcript: .closed), at: clock.time.monotonicNow())
        try #require(await panel.states().first { @Sendable in annaRow(in: $0)?.labelIsTentative == false } != nil)
        text.continuation.finish()
        await names.finalizationEnded()
    }

    @MainActor
    @Test func diarizedTurnsAfterTheCallEndsConfirmTheFinishedCall() async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel(), names = RecordingNames()
        defer { clock.finish() }
        let panel = makeAudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) }, zoomName: unknownZoomName)
        let text = AsyncStream<CallState>.makeStream()
        panel.begin(id: 1, text: text.stream, names: names)
        panel.sessionChanged(id: 1, SessionState(phase: .recording), at: clock.time.monotonicNow())
        clock.advance(20)
        try await speakInTurns(channel.connect(), to: names)

        text.continuation.yield(remote())
        try #require(await panel.states().first { @Sendable in annaRow(in: $0)?.labelIsTentative == true } != nil)
        text.continuation.finish()
        panel.sessionChanged(id: 1, .init(phase: .ended, transcript: .closed), at: clock.time.monotonicNow())
        try #require(await names.states().first { @Sendable in $0.observation == .stopped } != nil)

        await names.diarized(turns, rows: [Row(id: 1, start: 0, end: 4)])
        try #require(await panel.states().first { @Sendable in annaRow(in: $0)?.labelIsTentative == false } != nil)
        await names.finalizationEnded()
    }

    @MainActor
    @Test func confirmationReachesOnlyTheFinishedCallsNamesPort() async throws {
        let app = ApplicationCallNames(now: { 40 }, makeWatch: { _ in .init(sources: []) })
        let first = RecordingNames(), second = RecordingNames()
        defer {
            app.send(.finalized(1))
            app.send(.finalized(2))
        }
        let row = Row(id: 1, start: 0, end: 4)
        func start(_ id: UInt64, _ names: RecordingNames, speaker: String, at: Double) {
            app.open(id: id, published: names)
            app.sessionChanged(id: id, phase: .recording, hasTranscript: true, at: at)
            app.send(.update(id, .zoom(.started(speaker), at: 0)))
            app.send(.update(id, .zoom(.observed, at: 10)))
            app.send(.update(id, .rows([row], now: at + 10)))
        }

        start(1, first, speaker: "Анна", at: 0)
        var firstSeen = first.states().makeAsyncIterator()
        while let state = await firstSeen.next(), state.rowNames.isEmpty {}
        try #require(first.snapshot().rowNames == [1: "Анна"])
        app.sessionChanged(id: 1, phase: .ended, hasTranscript: true, at: 15)

        start(2, second, speaker: "Борис", at: 20)
        let secondBeforeConfirmation = try #require(await second.states().first { @Sendable in
            $0.observation == .observing && !$0.rowNames.isEmpty
        })
        #expect(secondBeforeConfirmation.rowNames == [1: "Борис"])

        await first.diarized([.init(speaker: 0, start: 0, end: 4), .init(speaker: 0, start: 5, end: 9)], rows: [row])
        try #require(await first.states().first { @Sendable in $0.confirmed } != nil)
        await first.finalizationEnded()
        while await firstSeen.next() != nil {}
        #expect(first.snapshot().rowNames == [1: "Анна"])
        #expect(first.snapshot().confirmed)
        #expect(second.snapshot() == secondBeforeConfirmation)
    }

    @MainActor
    @Test(arguments: [false, true])
    func releasingNamesKeepsTheWatchStoppingUntilItsSourceCloses(hasTranscript: Bool) async throws {
        let source = GatedWatchSource()
        defer { source.stopping.end(); source.close.end(); source.updates.continuation.finish() }
        var watches = [CallAppWatch(sources: [source]), CallAppWatch(sources: [])]
        let app = ApplicationCallNames(now: { 10 }, makeWatch: { _ in watches.removeFirst() })
        let names = RecordingNames(), next = RecordingNames()
        app.open(id: 1, published: names)
        let states = names.states()
        try #require(await names.states().first { @Sendable in $0.observation == .observing } != nil)

        app.sessionChanged(id: 1, phase: .ended, hasTranscript: hasTranscript, at: 10)
        await source.stopping.next()
        if hasTranscript { await names.finalizationEnded() }
        for await _ in states {}
        app.open(id: 2, published: next)
        try #require(await next.states().first { @Sendable in $0.observation != .idle }?.observation == .pending)

        source.close.end()
        try #require(await next.states().first { @Sendable in $0.observation == .observing } != nil)
        app.send(.finalized(2))
    }

    @MainActor
    @Test func afterCallTurnsUseEvidenceOnlyAfterTheSourceCloses() async throws {
        let source = GatedWatchSource()
        defer { source.stopping.end(); source.close.end(); source.updates.continuation.finish() }
        let app = ApplicationCallNames(now: { 10 }, makeWatch: { _ in .init(sources: [source]) })
        let names = RecordingNames()
        app.open(id: 1, published: names)
        app.sessionChanged(id: 1, phase: .recording, hasTranscript: true, at: 0)
        source.updates.continuation.yield(.zoom(.started("Анна"), at: 0))
        source.updates.continuation.yield(.zoom(.observed, at: 10))
        try #require(await names.states().first { @Sendable in $0.through == 10 } != nil)

        app.sessionChanged(id: 1, phase: .ended, hasTranscript: true, at: 10)
        await source.stopping.next()
        await names.diarized(turns, rows: [Row(id: 1, start: 0, end: 4)])
        source.updates.continuation.yield(.zoom(.stopped("Анна"), at: 11))
        let stillStopping = try #require(await names.states().first { @Sendable in $0.through == 11 })
        #expect(stillStopping.observation == .stopping)
        #expect(!stillStopping.confirmed)

        source.close.end()
        let confirmed = try #require(await names.states().first { @Sendable in $0.confirmed })
        #expect(confirmed.observation == .stopped)
        #expect(confirmed.rowNames == [1: "Анна"])
        await names.finalizationEnded()
    }

    @MainActor
    @Test func watchClockIsNilWhileItsOwnRecordingIsOff() async throws {
        let clock = FixtureClock(), first = RecordingNames(), second = RecordingNames()
        var clocks: [@Sendable () async -> Double?] = []
        let app = ApplicationCallNames(now: clock.time.monotonicNow, makeWatch: {
            clocks.append($0)
            return .init(sources: [])
        })
        defer {
            app.send(.finalized(1))
            app.send(.finalized(2))
            clock.finish()
        }

        app.open(id: 1, published: first)
        let firstClock = try #require(clocks.first)
        try #require(await first.states().first { @Sendable in $0.observation == .observing } != nil)
        clock.advance(10)
        #expect(await firstClock() == nil)

        app.sessionChanged(id: 1, phase: .recording, hasTranscript: true, at: clock.time.monotonicNow())
        try #require(await first.states().first { @Sendable in $0.recordingStart == 10 } != nil)
        clock.advance(4)
        #expect(await firstClock() == 4)
        app.sessionChanged(id: 1, phase: .ended, hasTranscript: true, at: clock.time.monotonicNow())
        try #require(await first.states().first { @Sendable in $0.observation == .stopped } != nil)

        clock.advance(6)
        app.open(id: 2, published: second)
        try #require(clocks.count == 2)
        let secondClock = clocks[1]
        app.sessionChanged(id: 2, phase: .recording, hasTranscript: true, at: clock.time.monotonicNow())
        try #require(await second.states().first { @Sendable in $0.recordingStart == 20 } != nil)
        clock.advance(3)
        #expect(await secondClock() == 3)
        #expect(await firstClock() == nil)
    }

}

private struct GatedWatchSource: CallAppObserver {
    let stopping = Signal()
    let close = Signal()
    let updates = AsyncStream<CallNamesUpdate>.makeStream()

    func observe() -> AsyncStream<CallNamesUpdate> { updates.stream }

    func stop() async {
        stopping.send()
        await close.next()
        updates.continuation.finish()
    }
}

/// The browser's clock reads 100 s at call time 20 s; Анна and Борис take turns
/// over the call's first 16 s.
private func speakInTurns(_ peer: FakeBrowserPeer, to names: RecordingNames) async throws {
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
    try #require(await names.states().first { @Sendable state in
        let anna = state.browser.intervals.filter { $0.memberID == "t1" }
        return anna.map(\.start) == [0, 8] && anna.compactMap(\.end) == [4, 12]
    } != nil)
}

private func annaRow(in state: PanelState) -> PanelState.Entry? {
    guard case let .lines(lines) = state.log else { return nil }
    return lines.entries.first { $0.label == "Анна" }
}

/// The pass's turns: speaker 0 where Анна spoke, speaker 1 where Борис did.
private let turns = [0, 4, 8, 12].enumerated().map {
    DiarizedTurn(speaker: $0.offset % 2, start: Double($0.element), end: Double($0.element + 4))
}

/// A remote row spoken over the call's first 4 s, while Анна spoke.
private func remote() -> CallState {
    let entry = CallState.Entry(speaker: .theirs, text: .init(id: 1, start: 0, end: 4, words: [
        .init("привет", start: 0, end: 2), .init("всем", start: 2, end: 4),
    ], settledCount: 1), writtenLater: false)
    return .init(status: .listening, entries: .init(tail: [entry]), finalCount: 0)
}
