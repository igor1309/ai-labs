import BrowserBridge
import Foundation
import Synchronization
import LiveText
import PanelUI
import Session
import Testing
@testable import CallText
@testable import Composer

/// The panel opens the browser channel for a recording and names a remote row
/// from what the extension reports; without the channel the row stays unnamed.
@Suite(.timeLimit(.minutes(1)))
struct BrowserNamesWiringTests {

    @MainActor
    @Test func aConnectedExtensionNamesTheRemoteRow() async throws {
        let clock = FixtureClock(), channel = FakeChannel()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { channel.open() }, sleep: { try await Task.sleep(for: $0 * 10_000) })
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording))
        clock.advance(20)

        // The browser's clock reads 100 s at call time 20 s.
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        #expect(await sent.next() == BrowserClockReply.ping(0))
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        peer.send(message(0, #"{"type":"roster","at":89000,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#))
        peer.send(message(1, #"{"type":"speakingStarted","at":90000,"participantId":"t1"}"#))
        peer.send(message(2, #"{"type":"speakingStopped","at":94000,"participantId":"t1"}"#))

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
        #expect(channel.stopped)
        clock.finish()
    }

    @MainActor
    @Test func withoutTheChannelTheRemoteRowStaysUnnamed() async throws {
        let clock = FixtureClock()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals,
                                 browser: { nil }, sleep: { _ in })
        let text = AsyncStream<CallState>.makeStream()
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording))
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
private func remote(_ round: Int) -> CallState {
    let entry = CallState.Entry(speaker: .theirs, text: .init(id: 1, start: 11, end: 12, words: [
        .init("привет", start: 11, end: 11.5), .init("w\(round)", start: 11.5, end: 12),
    ], settledCount: 1), writtenLater: false)
    return .init(status: .listening, entries: .init(tail: [entry]), finalCount: 0)
}

private func message(_ sequence: Int, _ event: String) -> String {
    #"{"version":1,"callId":"12345678901234","sequence":\#(sequence),"event":\#(event)}"#
}

private final class FakeChannel: Sendable {
    private let connections = AsyncStream<BrowserConnection>.makeStream()
    private let stops = Mutex(0)

    var stopped: Bool { stops.withLock { $0 } == 1 }

    func open() -> BrowserChannel {
        BrowserChannel(connections: connections.stream, stop: { [self] in
            stops.withLock { $0 += 1 }
            connections.continuation.finish()
        })
    }

    func connect() -> FakePeer {
        let peer = FakePeer()
        connections.continuation.yield(BrowserConnection(frames: peer.frames, send: { peer.sentIn.yield($0) }, close: { peer.framesIn.finish() }))
        return peer
    }
}

private final class FakePeer: Sendable {
    let frames: AsyncStream<Data>
    let framesIn: AsyncStream<Data>.Continuation
    let sent: AsyncStream<Data>
    let sentIn: AsyncStream<Data>.Continuation

    init() {
        (frames, framesIn) = AsyncStream.makeStream()
        (sent, sentIn) = AsyncStream.makeStream()
    }

    func send(_ text: String) { framesIn.yield(Data(text.utf8)) }
}
