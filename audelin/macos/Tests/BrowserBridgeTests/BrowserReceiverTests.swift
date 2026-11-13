import BrowserBridge
import Foundation
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct BrowserReceiverTests {
    @Test func publishesAValidStreamAndItsDisconnect() async {
        let transport = FakeTransport()
        let sut = BrowserReceiver(connections: transport.connections, now: { 0 }, sleep: { try await Task.sleep(for: $0 * 1000) })
        let peer = transport.connect()
        peer.send(frame(sequence: 0)); peer.send(frame(sequence: 1)); peer.disconnect()
        transport.stop()

        #expect(await Array(sut.events) == [
            .message(connection: 0, message(sequence: 0)),
            .message(connection: 0, message(sequence: 1)),
            .disconnected(connection: 0),
        ])
        #expect(peer.closeCount == 0)
    }

    @Test func closesAConnectionOnAMalformedMessage() async {
        let transport = FakeTransport()
        let sut = BrowserReceiver(connections: transport.connections, now: { 0 }, sleep: { try await Task.sleep(for: $0 * 1000) })
        let peer = transport.connect()
        peer.send(frame(sequence: 0)); peer.send(Data("{\"version\":2}".utf8)); peer.send(frame(sequence: 1))
        transport.stop()

        let events = await Array(sut.events)
        #expect(events.count == 2)
        #expect(events.first == .message(connection: 0, message(sequence: 0)))
        guard case .rejected(connection: 0, _) = events.last else { Issue.record("not rejected: \(events)"); return }
        #expect(peer.closeCount == 1)
    }

    @Test func closesAConnectionThatReplaysASequence() async {
        let transport = FakeTransport()
        let sut = BrowserReceiver(connections: transport.connections, now: { 0 }, sleep: { try await Task.sleep(for: $0 * 1000) })
        let peer = transport.connect()
        peer.send(frame(sequence: 3)); peer.send(frame(sequence: 3))
        transport.stop()

        let events = await Array(sut.events)
        #expect(events.first == .message(connection: 0, message(sequence: 3)))
        #expect(events.last == .rejected(connection: 0, reason: "sequence 3 does not follow 3"))
        #expect(peer.closeCount == 1)
    }

    @Test func aRejectedConnectionLeavesTheNextOneOpen() async {
        let transport = FakeTransport()
        let sut = BrowserReceiver(connections: transport.connections, now: { 0 }, sleep: { try await Task.sleep(for: $0 * 1000) })
        let bad = transport.connect()
        bad.send(Data("not json".utf8))
        let good = transport.connect()
        good.send(frame(sequence: 0)); good.disconnect()
        transport.stop()

        let events = await Array(sut.events)
        #expect(events.filter { if case .rejected(connection: 0, _) = $0 { true } else { false } }.count == 1)
        #expect(events.contains(.message(connection: 1, message(sequence: 0))))
        #expect(events.contains(.disconnected(connection: 1)))
        #expect(events.count == 3)
        #expect(good.closeCount == 0)
    }
}

extension BrowserReceiverTests {
    @Test func ignoresAReplyToAPingNeverSent() async {
        let transport = FakeTransport()
        let sut = BrowserReceiver(connections: transport.connections, now: { 0 }, sleep: { try await Task.sleep(for: $0 * 1000) })
        let peer = transport.connect()
        peer.send(frame(sequence: 0)); peer.send(Data(#"{"version":1,"ping":3,"at":1000}"#.utf8)); peer.send(frame(sequence: 1)); peer.disconnect()
        transport.stop()

        #expect(await Array(sut.events) == [
            .message(connection: 0, message(sequence: 0)),
            .message(connection: 0, message(sequence: 1)),
            .disconnected(connection: 0),
        ])
    }
}

private func message(sequence: Int) -> BrowserMessage {
    BrowserMessage(callID: "12345678901234", sequence: sequence, event: .callEnded(at: 1000))
}

private func frame(sequence: Int) -> Data {
    Data(#"{"version":1,"callId":"12345678901234","sequence":\#(sequence),"event":{"type":"callEnded","at":1000}}"#.utf8)
}

private extension Array {
    init(_ stream: AsyncStream<Element>) async {
        self = []
        for await element in stream { append(element) }
    }
}

private final class FakeTransport: Sendable {
    let connections: AsyncStream<BrowserConnection>
    private let continuation: AsyncStream<BrowserConnection>.Continuation

    init() { (connections, continuation) = AsyncStream.makeStream() }

    func connect() -> FakePeer {
        let peer = FakePeer()
        continuation.yield(BrowserConnection(frames: peer.frames, send: { _ in }, close: { peer.closed() }))
        return peer
    }

    func stop() { continuation.finish() }
}

private final class FakePeer: Sendable {
    let frames: AsyncStream<Data>
    private let continuation: AsyncStream<Data>.Continuation
    private let closes = Mutex(0)

    init() { (frames, continuation) = AsyncStream.makeStream() }

    var closeCount: Int { closes.withLock { $0 } }
    func send(_ data: Data) { continuation.yield(data) }
    func disconnect() { continuation.finish() }
    func closed() { closes.withLock { $0 += 1 }; continuation.finish() }
}
