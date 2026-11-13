import Darwin
import Foundation
import Synchronization

/// Where the app listens for its native host.
public enum BrowserSocket {
    public static func path(home: URL) -> URL {
        home.appendingPathComponent("Library/Application Support/Audelin/browser.sock")
    }
}

public enum SocketLinkFailure: Error, Equatable {
    case pathTooLong
    case connect(Int32)
}

extension RelayLink {
    /// A link over a connected Unix socket, framed the way the browser frames
    /// messages. Reads arrive through the file handle's readability handler,
    /// so no thread waits on the socket.
    public static func socket(_ descriptor: Int32) -> RelayLink {
        // A write after the peer closed fails with EPIPE instead of killing the process.
        var on: Int32 = 1
        setsockopt(descriptor, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        let messages = AsyncThrowingStream<Data, any Error>.makeStream()
        let pending = Mutex(Data())
        handle.readabilityHandler = { handle in
            let bytes = handle.availableData
            guard !bytes.isEmpty else {
                handle.readabilityHandler = nil; messages.continuation.finish(); return
            }
            do {
                let decoded = try pending.withLock { pending in
                    let decoded = try NativeMessageFraming.decode(pending + bytes)
                    pending = decoded.rest
                    return decoded
                }
                for message in decoded.messages { messages.continuation.yield(message) }
            } catch {
                handle.readabilityHandler = nil; messages.continuation.finish(throwing: error)
            }
        }
        return RelayLink(
            send: { message in try handle.write(contentsOf: NativeMessageFraming.encode(message)) },
            receive: {
                var iterator = messages.stream.makeAsyncIterator()
                return try await iterator.next()
            },
            close: {
                handle.readabilityHandler = nil
                messages.continuation.finish()
                Darwin.shutdown(descriptor, SHUT_RDWR)
            })
    }

    /// Connects to the app's socket at `path`.
    public static func connect(to path: URL) throws -> RelayLink {
        let descriptor = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw SocketLinkFailure.connect(errno) }
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.path.utf8)
        guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else {
            Darwin.close(descriptor); throw SocketLinkFailure.pathTooLong
        }
        withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes) }
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result == 0 else { let code = errno; Darwin.close(descriptor); throw SocketLinkFailure.connect(code) }
        return socket(descriptor)
    }
}

