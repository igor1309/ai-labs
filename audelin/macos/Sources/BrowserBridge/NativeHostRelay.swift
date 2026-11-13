import Foundation

/// One side of the relay's link to the app: whole messages in, whole messages out.
public struct RelayLink: Sendable {
    public var send: @Sendable (Data) async throws -> Void
    /// The next message, or nil once the app closed the link.
    public var receive: @Sendable () async throws -> Data?
    public var close: @Sendable () -> Void

    public init(send: @escaping @Sendable (Data) async throws -> Void,
                receive: @escaping @Sendable () async throws -> Data?,
                close: @escaping @Sendable () -> Void) {
        self.send = send; self.receive = receive; self.close = close
    }
}

/// The native host the browser starts: it passes framed messages from the
/// browser (its standard input) to the app, and the app's messages back to
/// the browser framed (its standard output). It ends when either side
/// closes or sends what cannot be framed, and then closes the link.
public struct NativeHostRelay: Sendable {
    /// The next bytes from the browser, or nil once the browser closed its side.
    private let read: @Sendable () async throws -> Data?
    private let write: @Sendable (Data) async throws -> Void
    private let link: RelayLink

    public init(read: @escaping @Sendable () async throws -> Data?,
                write: @escaping @Sendable (Data) async throws -> Void,
                link: RelayLink) {
        self.read = read; self.write = write; self.link = link
    }

    /// Returns once either side has ended. The other side's pending read is
    /// cancelled but not awaited: a blocked standard input read cannot end
    /// before the process exits.
    public func run() async {
        let ended = AsyncStream<Void>.makeStream()
        let inbound = Task { [read, link] in
            var pending = Data()
            do {
                while let bytes = try await read() {
                    let decoded = try NativeMessageFraming.decode(pending + bytes)
                    pending = decoded.rest
                    for message in decoded.messages { try await link.send(message) }
                }
            } catch {}
            ended.continuation.yield()
        }
        let outbound = Task { [write, link] in
            do {
                while let message = try await link.receive() {
                    try await write(NativeMessageFraming.encode(message))
                }
            } catch {}
            ended.continuation.yield()
        }
        for await _ in ended.stream { break }
        link.close()
        inbound.cancel(); outbound.cancel()
    }
}
