import BrowserBridge
import Darwin
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1))) struct BrowserSocketListenerTests {
    @Test func aHostsMessagesReachTheReceiverAndItsCloseEndsTheConnection() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path, secret: secret)
            defer { listener.stop() }
            let receiver = BrowserReceiver(connections: listener.connections, now: { 0 }, sleep: { try await Task.sleep(for: $0 * 1000) })
            var events = receiver.events.makeAsyncIterator()
            let host = try await admitted(path)
            try await host.send(frame(sequence: 0))
            #expect(await events.next() == .message(connection: 0, message(sequence: 0)))
            host.close()
            #expect(await events.next() == .disconnected(connection: 0))
        }
    }

    @Test func theAppsCloseEndsTheHostsLink() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path, secret: secret)
            defer { listener.stop() }
            var accepted = listener.connections.makeAsyncIterator()
            let host = try await admitted(path)
            let connection = try #require(await accepted.next())
            connection.close()
            #expect(try await host.receive() == nil)
        }
    }

    @Test func servesTwoConnectionsAtOnce() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path, secret: secret)
            defer { listener.stop() }
            var accepted = listener.connections.makeAsyncIterator()
            let first = try await admitted(path)
            let one = try #require(await accepted.next())
            let second = try await admitted(path)
            let two = try #require(await accepted.next())
            try await second.send(Data("from second".utf8))
            try await first.send(Data("from first".utf8))
            var oneFrames = one.frames.makeAsyncIterator(), twoFrames = two.frames.makeAsyncIterator()
            #expect(await oneFrames.next() == Data("from first".utf8))
            #expect(await twoFrames.next() == Data("from second".utf8))
            first.close(); second.close()
        }
    }

    @Test func replacesAStaleSocketFileAndRemovesItsOwnOnStop() async throws {
        try await withSocketFolder { path in
            try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data("stale".utf8).write(to: path)
            let listener = try BrowserSocketListener(path: path, secret: secret)
            var accepted = listener.connections.makeAsyncIterator()
            let host = try await admitted(path)
            #expect(await accepted.next() != nil)
            host.close()
            listener.stop()
            #expect(!FileManager.default.fileExists(atPath: path.path))
            #expect(await accepted.next() == nil)
        }
    }

    @Test(arguments: [Data(repeating: 7, count: BrowserSocketSecret.size), Data("short".utf8)])
    func closesAConnectionThatPresentsAnotherSecret(presented: Data) async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path, secret: secret)
            let intruder = try RelayLink.connect(to: path)
            try await intruder.send(presented)
            try await intruder.send(Data("sneaked".utf8))
            #expect(try await intruder.receive() == nil)
            let host = try await admitted(path)
            var accepted = listener.connections.makeAsyncIterator()
            let connection = try #require(await accepted.next())
            var frames = connection.frames.makeAsyncIterator()
            try await host.send(Data("from host".utf8))
            #expect(await frames.next() == Data("from host".utf8))
            host.close(); listener.stop()
        }
    }

    @Test func closesAConnectionThatEndsBeforePresentingASecret() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path, secret: secret)
            RelayLink.connectedThenClosed(path)
            let host = try await admitted(path)
            var accepted = listener.connections.makeAsyncIterator()
            let connection = try #require(await accepted.next())
            var frames = connection.frames.makeAsyncIterator()
            try await host.send(Data("first real".utf8))
            #expect(await frames.next() == Data("first real".utf8))
            host.close(); listener.stop()
        }
    }

    @Test func refusesAPathTooLongForASocket() {
        #expect(throws: BrowserSocketListenerFailure.pathTooLong) {
            try BrowserSocketListener(path: URL(fileURLWithPath: "/" + String(repeating: "a", count: 200)), secret: secret)
        }
    }
}

private let secret = Data(repeating: 42, count: BrowserSocketSecret.size)

/// Connects as Audelin's helper does: the secret first.
private func admitted(_ path: URL) async throws -> RelayLink {
    let link = try RelayLink.connect(to: path)
    try await link.send(secret)
    return link
}

private extension RelayLink {
    static func connectedThenClosed(_ path: URL) { (try? connect(to: path))?.close() }
}

/// A short folder: socket paths are limited to 104 bytes.
private func withSocketFolder(_ body: (URL) async throws -> Void) async throws {
    let folder = URL(fileURLWithPath: "/tmp").appendingPathComponent("bsl-\(UUID().uuidString.prefix(8))")
    defer { try? FileManager.default.removeItem(at: folder) }
    try await body(folder.appendingPathComponent("browser.sock"))
}

private func message(sequence: Int) -> BrowserMessage {
    BrowserMessage(callID: "12345678901234", sequence: sequence, event: .callEnded(at: 1000))
}

private func frame(sequence: Int) -> Data {
    Data(#"{"version":1,"callId":"12345678901234","sequence":\#(sequence),"event":{"type":"callEnded","at":1000}}"#.utf8)
}
