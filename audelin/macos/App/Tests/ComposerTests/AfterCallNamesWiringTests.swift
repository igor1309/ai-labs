import BrowserBridge
import CallNames
import Foundation
import LiveText
import PanelUI
import Session
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
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) })
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, names: names, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording))
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
