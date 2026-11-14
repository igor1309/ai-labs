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
        let sut = BrowserCallObserver(openBrowser: { nil }, clock: { 1 }, monotonic: { 0 }, sleep: { _ in })
        var events: [CallNamesEvent] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events.isEmpty)
    }

    @Test func aClockedConnectionReportsItselfAndItsMessagesInCallTime() async {
        let channel = FakeChannel()
        // Monotonic 50 s is call time 20 s: the call started 30 s into the monotonic clock.
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, clock: { 20 }, monotonic: { 50 },
                                      sleep: { _ in try await Task.sleep(for: .seconds(3600)) })
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
        #expect(channel.stops == 1)
    }

    @Test func aMessageBeforeRecordingStartsIsDropped() async {
        let channel = FakeChannel()
        let times = Mutex<[Double?]>([nil, 20])
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, clock: { times.withLock { $0.count > 1 ? $0.removeFirst() : $0[0] } },
                                      monotonic: { 50 }, sleep: { _ in try await Task.sleep(for: .seconds(3600)) })
        var events = sut.observe().makeAsyncIterator()
        let peer = channel.connect()
        var sent = peer.sent.makeAsyncIterator()
        _ = await sent.next()
        peer.send(#"{"version":1,"ping":0,"at":100000}"#)
        #expect(await events.next() == .browserConnected(0))
        peer.send(message(0, #"{"type":"speakingStarted","at":89000,"participantId":"t1"}"#))
        peer.send(message(1, #"{"type":"speakingStopped","at":90000,"participantId":"t1"}"#))
        #expect(await events.next() == .browser(.init(epoch: 0, sequence: 1, time: 10, kind: .speaking(memberID: "t1", false))))
        await sut.stop()
    }

    @Test func stopClosesTheChannelAndEndsTheStream() async {
        let channel = FakeChannel()
        let sut = BrowserCallObserver(openBrowser: { channel.open() }, clock: { 1 }, monotonic: { 0 }, sleep: { _ in })
        let events = sut.observe()
        await sut.stop()
        var delivered: [CallNamesEvent] = []
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
