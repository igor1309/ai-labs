import Darwin
import Foundation

public enum BrowserSocketListenerFailure: Error, Equatable {
    case pathTooLong
    case system(Int32)
}

/// Listens on the Unix socket the native host connects to and hands each
/// accepted connection to the receiver as frames plus a close, once its first
/// message has presented the secret; any other connection is closed unseen. A socket file
/// left at the path by an earlier run is replaced; `stop` removes the file.
public final class BrowserSocketListener: Sendable {
    public let connections: AsyncStream<BrowserConnection>
    private let continuation: AsyncStream<BrowserConnection>.Continuation
    private let handle: FileHandle
    private let path: URL

    public init(path: URL, secret: Data) throws {
        self.path = path
        let bytes = Array(path.path.utf8)
        var address = sockaddr_un()
        guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else {
            throw BrowserSocketListenerFailure.pathTooLong
        }
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        unlink(path.path)
        let descriptor = socket(AF_UNIX, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw BrowserSocketListenerFailure.system(errno) }
        address.sun_family = sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes) }
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bound == 0, listen(descriptor, 8) == 0,
              fcntl(descriptor, F_SETFL, fcntl(descriptor, F_GETFL) | O_NONBLOCK) == 0 else {
            let code = errno; Darwin.close(descriptor); throw BrowserSocketListenerFailure.system(code)
        }
        (connections, continuation) = AsyncStream.makeStream()
        handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        handle.readabilityHandler = { [continuation] _ in
            while true {
                let accepted = accept(descriptor, nil, nil)
                guard accepted >= 0 else { return }
                _ = fcntl(accepted, F_SETFL, fcntl(accepted, F_GETFL) & ~O_NONBLOCK)
                Self.admit(accepted, secret: secret, to: continuation)
            }
        }
    }

    /// Stops accepting, removes the socket file and ends `connections`.
    /// Connections already handed out stay open until they close.
    public func stop() {
        handle.readabilityHandler = nil
        try? handle.close()
        unlink(path.path)
        continuation.finish()
    }

    private static func admit(_ descriptor: Int32, secret: Data,
                              to continuation: AsyncStream<BrowserConnection>.Continuation) {
        let link = RelayLink.socket(descriptor)
        Task {
            guard let presented = try? await link.receive(), BrowserSocketSecret.matches(presented, secret) else {
                link.close(); return
            }
            let frames = AsyncStream<Data> { frames in
                let reading = Task {
                    while let message = try? await link.receive() { frames.yield(message) }
                    frames.finish()
                }
                frames.onTermination = { _ in reading.cancel() }
            }
            continuation.yield(BrowserConnection(frames: frames, send: link.send, close: link.close))
        }
    }
}
