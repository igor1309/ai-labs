import BrowserBridge
import CallNames
import CallObservation
@testable import Composer
import Foundation
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct BrowserCallObserverTests {

    @Test func withoutAChannelNothingIsReportedAndTheStreamEnds() async {
        let browser = SharedBrowserObservations(open: { nil }, monotonic: { 0 }, sleep: { _ in }, log: FixtureLog())
        let sut = BrowserCallObserver(browser: browser, clock: { 1 }, monotonic: { 0 }, log: FixtureLog())
        var events: [CallNamesUpdate] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events.isEmpty)
    }

    @Test func aClockedConnectionReportsItselfAndItsMessagesInCallTime() async {
        let channel = FakeChannel()
        // Monotonic 50 s is call time 20 s: the call started 30 s into the monotonic clock.
        let browser = SharedBrowserObservations(open: channel.open, monotonic: { 50 }, sleep: holdPing, log: FixtureLog())
        let sut = BrowserCallObserver(browser: browser, clock: { 20 }, monotonic: { 50 }, log: FixtureLog())
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        #expect(await sent.next() == BrowserClockReply.ping(0))
        // The browser's clock reads 100 s at monotonic 50 s.
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        #expect(await events.next() == .browserConnected(0))
        peer.send(message(0, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 0, time: 9, kind: .speaking(memberID: "t1", true))))
        peer.framesIn.finish()
        #expect(await events.next() == .browserDisconnected(0))
        await sut.stop()
        #expect(await events.next() == nil)
        #expect(channel.stops == 0)
    }

    @Test func twoWatchesShareOneConnectionAndPlaceItsMessagesOnTheirOwnClocks() async {
        let channel = FakeChannel()
        let browser = SharedBrowserObservations(open: channel.open, monotonic: { 50 }, sleep: holdPing, log: FixtureLog())
        let first = BrowserCallObserver(browser: browser, clock: { 20 }, monotonic: { 50 }, log: FixtureLog())
        let second = BrowserCallObserver(browser: browser, clock: { 12 }, monotonic: { 50 }, log: FixtureLog())
        var firstEvents = first.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        #expect(await sent.next() == BrowserClockReply.ping(0))
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        #expect(await firstEvents.next() == .browserConnected(0))

        var secondEvents = second.observe().makeAsyncIterator()
        #expect(await secondEvents.next() == .browserConnected(0))
        peer.send(message(0, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        #expect(await firstEvents.next() == .browser(.init(epoch: 0, sequence: 0, time: 9, kind: .speaking(memberID: "t1", true))))
        #expect(await secondEvents.next() == .browser(.init(epoch: 0, sequence: 0, time: 1, kind: .speaking(memberID: "t1", true))))

        await first.stop()
        #expect(await firstEvents.next() == nil)
        peer.send(message(1, #"{"type":"speakingStopped","at":90000,"participantId":"t1"}"#))
        #expect(await secondEvents.next() == .browser(.init(epoch: 0, sequence: 1, time: 2, kind: .speaking(memberID: "t1", false))))
        await second.stop()
        #expect(await secondEvents.next() == nil)
        #expect(channel.opens == 1 && channel.stops == 0)
    }

    @Test func aRosterReceivedBeforeAnyWatchReachesTheNextWatch() async throws {
        let feed = BrowserReceiverFeed()
        defer { feed.finish() }
        let roster = try BrowserMessage.decode(Data(message(0,
            #"{"type":"roster","at":80000,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#).utf8))
        let observation = BrowserReceiverEvent.message(connection: 1, roster)
        let calibrated = BrowserReceiverEvent.clock(connection: 1, BrowserClock())
        feed.publish(observation)
        feed.publish(calibrated)

        let first = feed.subscribe()
        defer { first.stop() }
        var firstEvents = first.events.makeAsyncIterator()
        #expect(await firstEvents.next() == observation)
        #expect(await firstEvents.next() == calibrated)
        let second = feed.subscribe()
        defer { second.stop() }
        var secondEvents = second.events.makeAsyncIterator()
        #expect(await secondEvents.next() == calibrated)
    }

    @Test func aMessageBeforeRecordingStartsIsHeldAndPlacedOnceItStarts() async {
        let channel = FakeChannel()
        let times = Mutex<[Double?]>([nil, 20])
        let browser = SharedBrowserObservations(open: channel.open, monotonic: { 50 }, sleep: holdPing, log: FixtureLog())
        let sut = BrowserCallObserver(browser: browser, clock: { times.withLock { $0.count > 1 ? $0.removeFirst() : $0[0] } }, monotonic: { 50 }, log: FixtureLog())
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        _ = await sent.next()
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        #expect(await events.next() == .browserConnected(0))
        peer.send(message(0, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        peer.send(message(1, #"{"type":"speakingStopped","at":90000,"participantId":"t1"}"#))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 0, time: 9, kind: .speaking(memberID: "t1", true))))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 1, time: 10, kind: .speaking(memberID: "t1", false))))
        await sut.stop()
    }

    @Test func messagesBeforeTheFirstClockReplyAreHeldAndPlacedInOrderOnceItComes() async {
        let channel = FakeChannel()
        let browser = SharedBrowserObservations(open: channel.open, monotonic: { 50 }, sleep: holdPing, log: FixtureLog())
        let sut = BrowserCallObserver(browser: browser, clock: { 20 }, monotonic: { 50 }, log: FixtureLog())
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        #expect(await sent.next() == BrowserClockReply.ping(0))
        // The extension flushes what it buffered at once, before answering the ping.
        peer.send(message(0, #"{"type":"roster","at":5000,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#))
        peer.send(message(1, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        #expect(await events.next() == .browserConnected(0))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 0, time: 0,
                                                      kind: .roster([.init(id: "t1", name: "Анна", isLocal: false)]))))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 1, time: 9, kind: .speaking(memberID: "t1", true))))
        await sut.stop()
    }

    @Test func theLogCountsWhatTheBrowserSendsWithoutNames() async {
        let channel = FakeChannel()
        let log = FixtureLog()
        let browser = SharedBrowserObservations(open: channel.open, monotonic: { 50 }, sleep: holdPing, log: log)
        let sut = BrowserCallObserver(browser: browser, clock: { 20 }, monotonic: { 50 }, log: log)
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        _ = await sent.next()
        peer.send(message(0, #"{"type":"roster","at":5000,"participants":[{"id":"t1","name":"Анна","isSelf":false},{"id":"t2","name":"Me","isSelf":true}]}"#))
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        _ = await events.next()
        _ = await events.next()
        peer.send(message(1, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        _ = await events.next()
        peer.framesIn.finish()
        _ = await events.next()
        await sut.stop()
        #expect(log.entries.all.map(\.message) == [
            "connection=0 clocked held=1",
            "connection=0 sequence=0 time=0.0 roster members=2 local=1",
            "connection=0 sequence=1 time=9.0 speaking=true member=t1",
            "connection=0 disconnected",
        ])
        #expect(log.entries.all.allSatisfy { $0.category == .browser })
    }

    @Test func theLogSaysWhenTheChannelCannotOpen() async {
        let log = FixtureLog()
        let browser = SharedBrowserObservations(open: { nil }, monotonic: { 0 }, sleep: { _ in }, log: log)
        let sut = BrowserCallObserver(browser: browser, clock: { 1 }, monotonic: { 0 }, log: log)
        for await _ in sut.observe() {}
        #expect(log.entries.all.map(\.message) == ["channel unavailable"])
    }

    @Test func stopEndsTheWatchAndLeavesTheAppChannelOpen() async {
        let channel = FakeChannel()
        let browser = SharedBrowserObservations(open: channel.open, monotonic: { 0 }, sleep: { _ in }, log: FixtureLog())
        let sut = BrowserCallObserver(browser: browser, clock: { 1 }, monotonic: { 0 }, log: FixtureLog())
        let events = sut.observe()
        await sut.stop()
        var delivered: [CallNamesUpdate] = []
        for await event in events { delivered.append(event) }
        #expect(delivered.isEmpty)
        #expect(channel.stops == 0)
    }
}

private func holdPing(_: Duration) async throws { try await Task.sleep(for: .seconds(3600)) }

private func message(_ sequence: Int, _ event: String) -> String {
    #"{"version":1,"callId":"12345678901234","sequence":\#(sequence),"event":\#(event)}"#
}

private final class FakeChannel: Sendable {
    private let connections = AsyncStream<BrowserConnection>.makeStream()
    private let opened = Mutex(0)
    private let stopped = Mutex(0)

    var opens: Int { opened.withLock { $0 } }
    var stops: Int { stopped.withLock { $0 } }

    func open() -> BrowserChannel {
        opened.withLock { $0 += 1 }
        return BrowserChannel(connections: connections.stream, stop: { [self] in
            stopped.withLock { $0 += 1 }
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
