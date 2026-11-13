import BrowserBridge
import Darwin
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1))) struct BrowserSocketListenerTests {
    @Test func aHostsMessagesReachTheReceiverAndItsCloseEndsTheConnection() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path)
            defer { listener.stop() }
            let receiver = BrowserReceiver(connections: listener.connections)
            var events = receiver.events.makeAsyncIterator()
            let host = try RelayLink.connect(to: path)
            try await host.send(frame(sequence: 0))
            #expect(await events.next() == .message(connection: 0, message(sequence: 0)))
            host.close()
            #expect(await events.next() == .disconnected(connection: 0))
        }
    }

    @Test func theAppsCloseEndsTheHostsLink() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path)
            defer { listener.stop() }
            var accepted = listener.connections.makeAsyncIterator()
            let host = try RelayLink.connect(to: path)
            let connection = try #require(await accepted.next())
            connection.close()
            #expect(try await host.receive() == nil)
        }
    }

    @Test func servesTwoConnectionsAtOnce() async throws {
        try await withSocketFolder { path in
            let listener = try BrowserSocketListener(path: path)
            defer { listener.stop() }
            var accepted = listener.connections.makeAsyncIterator()
            let first = try RelayLink.connect(to: path)
            let one = try #require(await accepted.next())
            let second = try RelayLink.connect(to: path)
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
            let listener = try BrowserSocketListener(path: path)
            var accepted = listener.connections.makeAsyncIterator()
            let host = try RelayLink.connect(to: path)
            #expect(await accepted.next() != nil)
            host.close()
            listener.stop()
            #expect(!FileManager.default.fileExists(atPath: path.path))
            #expect(await accepted.next() == nil)
        }
    }

    @Test func refusesAPathTooLongForASocket() {
        #expect(throws: BrowserSocketListenerFailure.pathTooLong) {
            try BrowserSocketListener(path: URL(fileURLWithPath: "/" + String(repeating: "a", count: 200)))
        }
    }
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
