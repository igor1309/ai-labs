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
        let sut = BrowserCallObserver(openBrowser: { nil }, monotonic: { 0 }, sleep: { _ in }, log: FixtureLog())
        var events: [CallNamesUpdate] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events.isEmpty)
    }

    @Test func aClockedConnectionReportsItselfAndItsMessagesAtMonotonicInstants() async {
        let channel = FakeChannel()
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, monotonic: { 50 },
                                      sleep: { _ in throw CancellationError() }, log: FixtureLog())
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        #expect(await sent.next() == BrowserClockReply.ping(0))
        // The browser's clock reads 100 s at monotonic 50 s.
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        #expect(await events.next() == .browserConnected(0))
        peer.send(message(0, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 0, time: 39, kind: .speaking(memberID: "t1", true)), receivedAt: 50))
        peer.framesIn.finish()
        #expect(await events.next() == .browserDisconnected(0))
        await sut.stop()
        #expect(await events.next() == nil)
        #expect(channel.stops == 1)
    }

    @Test func anUncalibratedConnectionKeepsOnlyItsNewestMessagesInOrder() async throws {
        let channel = FakeChannel()
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, monotonic: { 50 },
                                      sleep: { _ in throw CancellationError() }, log: FixtureLog())
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        defer { peer.framesIn.finish() }
        var sent = peer.sent.makeAsyncIterator()
        try #require(await sent.next() == BrowserClockReply.ping(0))
        let limit = BrowserCallObserver.heldLimit
        for sequence in 0...limit {
            peer.send(message(sequence, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        }
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        peer.framesIn.finish()
        #expect(await events.next() == .browserConnected(0))
        for sequence in 1...limit {
            try #require(await events.next() == .browser(.init(epoch: 0, sequence: sequence, time: 39,
                                                               kind: .speaking(memberID: "t1", true)), receivedAt: 50))
        }
        #expect(await events.next() == .browserDisconnected(0))
        await sut.stop()
        #expect(await events.next() == nil)
    }

    @Test func calibrationKeepsTheHeldRosterReceiptAndRecalibrationPlacesLaterMessages() async throws {
        let channel = FakeChannel()
        let clock = Mutex(104.5)
        let reads = AsyncStream<Double>.makeStream()
        let pings = AsyncStream<Void>.makeStream()
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, monotonic: {
            let instant = clock.withLock { $0 }
            reads.continuation.yield(instant)
            return instant
        }, sleep: { _ in
            var releases = pings.stream.makeAsyncIterator()
            guard await releases.next() != nil else { throw CancellationError() }
        }, log: FixtureLog())
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        defer { peer.framesIn.finish(); pings.continuation.finish(); reads.continuation.finish() }
        var sent = peer.sent.makeAsyncIterator()
        var instants = reads.stream.makeAsyncIterator()
        try #require(await sent.next() == BrowserClockReply.ping(0))
        try #require(await instants.next() == 104.5)
        clock.withLock { $0 = 104.75 }
        peer.send(message(0, #"{"type":"roster","at":155187.5,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#))
        try #require(await instants.next() == 104.75)

        clock.withLock { $0 = 105 }
        peer.send(#"{"version":1,"ping":0,"at":154750}"#)
        try #require(await events.next() == .browserConnected(0))
        let roster = Event(epoch: 0, sequence: 0, time: 105.1875, kind: .roster([.init(id: "t1", name: "Анна")]))
        #expect(await events.next() == .browser(roster, receivedAt: 104.75))
        try #require(await instants.next() == 105)

        // The next round trip spans recording start at 105.0625 and is shorter.
        clock.withLock { $0 = 105.03125 }
        pings.continuation.yield(())
        try #require(await sent.next() == BrowserClockReply.ping(1))
        try #require(await instants.next() == 105.03125)
        clock.withLock { $0 = 105.09375 }
        peer.send(#"{"version":1,"ping":1,"at":155187.5}"#)
        try #require(await instants.next() == 105.09375)

        clock.withLock { $0 = 105.15625 }
        peer.send(message(1, #"{"type":"speakingStarted","at":155250,"participantId":"t1"}"#))
        let speaking = Event(epoch: 0, sequence: 1, time: 105.125, kind: .speaking(memberID: "t1", true))
        #expect(await events.next() == .browser(speaking, receivedAt: 105.15625))
        await sut.stop()
    }

    @Test func theLogCountsWhatTheBrowserSendsWithoutNames() async {
        let channel = FakeChannel()
        let log = FixtureLog()
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, monotonic: { 50 },
                                      sleep: { _ in throw CancellationError() }, log: log)
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
            "connection=0 sequence=0 time=-45.0 roster members=2 local=1",
            "connection=0 sequence=1 time=39.0 speaking=true member=t1",
            "connection=0 disconnected",
        ])
        #expect(log.entries.all.allSatisfy { $0.category == .browser })
    }

    @Test func theLogSaysWhenTheChannelCannotOpen() async {
        let log = FixtureLog()
        let sut = BrowserCallObserver(openBrowser: { nil }, monotonic: { 0 }, sleep: { _ in }, log: log)
        for await _ in sut.observe() {}
        #expect(log.entries.all.map(\.message) == ["channel unavailable"])
    }

    @Test func stopClosesTheChannelAndEndsTheStream() async {
        let channel = FakeChannel()
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, monotonic: { 0 }, sleep: { _ in }, log: FixtureLog())
        let events = sut.observe()
        await sut.stop()
        var delivered: [CallNamesUpdate] = []
        for await event in events { delivered.append(event) }
        #expect(delivered.isEmpty)
        #expect(channel.stops == 1)
    }
}

private func message(_ sequence: Int, _ event: String) -> String {
    #"{"version":1,"callId":"12345678901234","sequence":\#(sequence),"event":\#(event)}"#
}

private final class FakeChannel: Sendable {
    private let connections = AsyncStream<BrowserConnection>.makeStream()
    private let stopped = Mutex(0)

    var stops: Int { stopped.withLock { $0 } }

    func open() -> BrowserChannel {
        BrowserChannel(connections: connections.stream, stop: { [self] in
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
