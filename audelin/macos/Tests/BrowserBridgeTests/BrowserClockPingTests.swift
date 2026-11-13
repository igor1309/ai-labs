import BrowserBridge
import Foundation
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct BrowserClockPingTests {
    @Test func pingsAConnectionAsItArrives() async {
        let (sut, transport, _, _) = makeSUT()
        let peer = transport.connect()
        var sent = peer.sent.makeAsyncIterator()

        #expect(await sent.next() == BrowserClockReply.ping(0))
        _ = sut
    }

    @Test func pingsAgainAfterEachInterval() async {
        let (sut, transport, _, scheduler) = makeSUT()
        let peer = transport.connect()
        var sent = peer.sent.makeAsyncIterator()
        var sleeps = scheduler.sleeps.makeAsyncIterator()

        #expect(await sent.next() == BrowserClockReply.ping(0))
        #expect(await sleeps.next() == .seconds(5))
        scheduler.wake()
        #expect(await sent.next() == BrowserClockReply.ping(1))
        #expect(await sleeps.next() == .seconds(5))
        _ = sut
    }

    @Test func recordsEachReplyAsARoundTrip() async {
        let (sut, transport, clock, scheduler) = makeSUT()
        let peer = transport.connect()
        var sent = peer.sent.makeAsyncIterator()
        var sleeps = scheduler.sleeps.makeAsyncIterator()
        var events = sut.events.makeAsyncIterator()

        clock.now = 10
        _ = await sent.next()
        clock.now = 10.2
        peer.send(reply(ping: 0, at: 5000))
        #expect(await events.next() == .clock(connection: 0, BrowserClock(roundTrips: [.init(sent: 10, received: 10.2, browser: 5000)])))

        _ = await sleeps.next()
        clock.now = 15
        scheduler.wake()
        _ = await sent.next()
        clock.now = 15.1
        peer.send(reply(ping: 7, at: 1))
        peer.send(reply(ping: 1, at: 10000))
        #expect(await events.next() == .clock(connection: 0, BrowserClock(roundTrips: [
            .init(sent: 10, received: 10.2, browser: 5000), .init(sent: 15, received: 15.1, browser: 10000),
        ])))
    }

    @Test func aReconnectStartsAFreshClock() async {
        let (sut, transport, clock, _) = makeSUT()
        var events = sut.events.makeAsyncIterator()
        let first = transport.connect()
        var firstSent = first.sent.makeAsyncIterator()
        clock.now = 1
        _ = await firstSent.next()
        first.send(reply(ping: 0, at: 1000))
        #expect(await events.next() == .clock(connection: 0, BrowserClock(roundTrips: [.init(sent: 1, received: 1, browser: 1000)])))
        first.disconnect()
        #expect(await events.next() == .disconnected(connection: 0))

        let second = transport.connect()
        var secondSent = second.sent.makeAsyncIterator()
        clock.now = 2
        #expect(await secondSent.next() == BrowserClockReply.ping(0))
        second.send(reply(ping: 0, at: 4000))

        #expect(await events.next() == .clock(connection: 1, BrowserClock(roundTrips: [.init(sent: 2, received: 2, browser: 4000)])))
    }

    @Test func stopsPingingAClosedConnection() async {
        let (sut, transport, _, scheduler) = makeSUT()
        let peer = transport.connect()
        var sent = peer.sent.makeAsyncIterator()
        var sleeps = scheduler.sleeps.makeAsyncIterator()
        var events = sut.events.makeAsyncIterator()
        _ = await sent.next()
        _ = await sleeps.next()

        peer.send(Data("not json".utf8))
        guard case .rejected(connection: 0, _) = await events.next() else { Issue.record("not rejected"); return }
        await scheduler.cancelled()
        transport.stop()

        #expect(await events.next() == nil)
        peer.finishSent()
        #expect(await sent.next() == nil)
    }

    @Test func endingTheEventsClosesAnOpenConnection() async {
        let (sut, transport, _, _) = makeSUT()
        let peer = transport.connect()
        var sent = peer.sent.makeAsyncIterator()
        let reading = Task { for await _ in sut.events {} }
        _ = await sent.next()

        reading.cancel()

        await peer.closed()
    }
}

private func makeSUT() -> (BrowserReceiver, FakeTransport, FakeClock, FakeScheduler) {
    let transport = FakeTransport(), clock = FakeClock(), scheduler = FakeScheduler()
    let sut = BrowserReceiver(connections: transport.connections, now: { clock.now },
                              sleep: { try await scheduler.sleep($0) }, interval: .seconds(5))
    return (sut, transport, clock, scheduler)
}

private func reply(ping: Int, at: Double) -> Data {
    Data(#"{"version":1,"ping":\#(ping),"at":\#(at)}"#.utf8)
}

private final class FakeClock: Sendable {
    private let value = Mutex(0.0)
    var now: Double {
        get { value.withLock { $0 } }
        set { value.withLock { $0 = newValue } }
    }
}

/// Each `sleep` is reported on `sleeps` and waits for `wake`, or throws when
/// its task is cancelled; `cancelled` returns once a sleep has been.
private final class FakeScheduler: Sendable {
    let sleeps: AsyncStream<Duration>
    private let reported: AsyncStream<Duration>.Continuation
    private let cancels: AsyncStream<Void>
    private let cancel: AsyncStream<Void>.Continuation
    private let waiting = Mutex<CheckedContinuation<Void, any Error>?>(nil)

    init() {
        (sleeps, reported) = AsyncStream.makeStream()
        (cancels, cancel) = AsyncStream.makeStream()
    }

    func sleep(_ duration: Duration) async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                if Task.isCancelled { continuation.resume(throwing: CancellationError()); return }
                waiting.withLock { $0 = continuation }
                reported.yield(duration)
            }
        } onCancel: {
            if let continuation = waiting.withLock({ $0.take() }) {
                continuation.resume(throwing: CancellationError())
                cancel.yield()
            }
        }
    }

    func wake() {
        let continuation = waiting.withLock { $0.take() }
        continuation?.resume()
    }

    func cancelled() async { for await _ in cancels { return } }
}

private final class FakeTransport: Sendable {
    let connections: AsyncStream<BrowserConnection>
    private let continuation: AsyncStream<BrowserConnection>.Continuation

    init() { (connections, continuation) = AsyncStream.makeStream() }

    func connect() -> FakePeer {
        let peer = FakePeer()
        continuation.yield(BrowserConnection(frames: peer.frames, send: { peer.received($0) }, close: { peer.close() }))
        return peer
    }

    func stop() { continuation.finish() }
}

/// A peer whose frames the test sends and whose `sent` reports what the
/// receiver sent it.
private final class FakePeer: Sendable {
    let frames: AsyncStream<Data>
    let sent: AsyncStream<Data>
    private let framesIn: AsyncStream<Data>.Continuation
    private let sentIn: AsyncStream<Data>.Continuation
    private let closes: AsyncStream<Void>
    private let closesIn: AsyncStream<Void>.Continuation

    init() {
        (frames, framesIn) = AsyncStream.makeStream()
        (sent, sentIn) = AsyncStream.makeStream()
        (closes, closesIn) = AsyncStream.makeStream()
    }

    func close() { closesIn.yield(); disconnect() }
    /// Returns once the receiver has closed the connection.
    func closed() async { for await _ in closes { return } }

    func send(_ data: Data) { framesIn.yield(data) }
    func disconnect() { framesIn.finish() }
    func received(_ data: Data) { sentIn.yield(data) }
    func finishSent() { sentIn.finish() }
}
