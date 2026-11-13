import BrowserBridge
import Darwin
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1))) struct SocketLinkTests {
    @Test func sendsFramedMessagesAndReceivesWholeOnes() async throws {
        let (mine, peer) = try pair()
        let link = RelayLink.socket(mine)
        defer { link.close(); Darwin.close(peer) }
        try await link.send(Data("hello".utf8))
        #expect(readAll(peer, count: 9) == frame("hello"))
        let bytes = frame("one") + frame("two")
        write(peer, bytes.prefix(5)); write(peer, bytes.dropFirst(5))
        #expect(try await link.receive() == Data("one".utf8))
        #expect(try await link.receive() == Data("two".utf8))
    }

    @Test func endsWhenThePeerCloses() async throws {
        let (mine, peer) = try pair()
        let link = RelayLink.socket(mine)
        defer { link.close() }
        Darwin.close(peer)
        #expect(try await link.receive() == nil)
    }

    @Test func failsOnAnUnframableMessage() async throws {
        let (mine, peer) = try pair()
        let link = RelayLink.socket(mine)
        defer { link.close(); Darwin.close(peer) }
        write(peer, withUnsafeBytes(of: UInt32(NativeMessageFraming.maximumFromBrowser + 1).littleEndian) { Data($0) })
        await #expect(throws: NativeMessageFraming.Failure.self) { try await link.receive() }
    }

    @Test func refusesASocketPathTooLongForTheSystem() {
        #expect(throws: SocketLinkFailure.pathTooLong) {
            try RelayLink.connect(to: URL(fileURLWithPath: "/" + String(repeating: "a", count: 200)))
        }
    }

    @Test func failsToConnectWhereNoAppListens() {
        #expect(throws: SocketLinkFailure.connect(ENOENT)) {
            try RelayLink.connect(to: URL(fileURLWithPath: "/nonexistent-audelin/browser.sock"))
        }
    }
}

private func pair() throws -> (Int32, Int32) {
    var fds: [Int32] = [0, 0]
    guard socketpair(AF_UNIX, SOCK_STREAM, 0, &fds) == 0 else { throw POSIXError(.EIO) }
    return (fds[0], fds[1])
}

private func write(_ fd: Int32, _ bytes: Data) {
    _ = bytes.withUnsafeBytes { Darwin.write(fd, $0.baseAddress, $0.count) }
}

private func readAll(_ fd: Int32, count: Int) -> Data {
    var result = Data()
    var buffer = [UInt8](repeating: 0, count: count)
    while result.count < count {
        let n = Darwin.read(fd, &buffer, count - result.count)
        guard n > 0 else { break }
        result.append(contentsOf: buffer[0..<n])
    }
    return result
}

private func frame(_ text: String) -> Data {
    withUnsafeBytes(of: UInt32(text.utf8.count).littleEndian) { Data($0) } + Data(text.utf8)
}

@Suite(.timeLimit(.minutes(1))) struct SocketLinkClosedPeerTests {
    @Test func sendingAfterThePeerClosedFailsInsteadOfEndingTheProcess() async throws {
        var fds: [Int32] = [0, 0]
        #expect(socketpair(AF_UNIX, SOCK_STREAM, 0, &fds) == 0)
        let link = RelayLink.socket(fds[0])
        defer { link.close() }
        Darwin.close(fds[1])
        await #expect(throws: (any Error).self) {
            for _ in 0..<4 { try await link.send(Data(repeating: 1, count: 4096)) }
        }
    }
}
