import Foundation

/// One connection from the extension's native-messaging host: the frames it
/// delivers, already cut at their length prefix, and a way to close it. The
/// frames end when the peer disconnects.
public struct BrowserConnection: Sendable {
    public var frames: AsyncStream<Data>
    public var close: @Sendable () -> Void

    public init(frames: AsyncStream<Data>, close: @Sendable @escaping () -> Void) {
        self.frames = frames; self.close = close
    }
}

/// What the receiver reports, per connection in the order the transport
/// accepted it.
public enum BrowserReceiverEvent: Equatable, Sendable {
    case message(connection: Int, BrowserMessage)
    /// The connection sent a frame that is not a valid message, or a sequence
    /// that does not increase; the receiver closed it.
    case rejected(connection: Int, reason: String)
    /// The peer ended the connection.
    case disconnected(connection: Int)
}

/// Accepts connections from the transport, decodes each frame and publishes
/// the results as one stream. A bad frame or a replayed sequence closes its
/// connection; other connections go on.
public struct BrowserReceiver: Sendable {
    public let events: AsyncStream<BrowserReceiverEvent>

    public init(connections: AsyncStream<BrowserConnection>) {
        let (events, continuation) = AsyncStream<BrowserReceiverEvent>.makeStream()
        self.events = events
        let task = Task {
            await withTaskGroup(of: Void.self) { group in
                var index = 0
                for await connection in connections {
                    let id = index
                    index += 1
                    group.addTask { await Self.serve(connection, id: id, into: continuation) }
                }
            }
            continuation.finish()
        }
        continuation.onTermination = { _ in task.cancel() }
    }

    private static func serve(_ connection: BrowserConnection, id: Int, into out: AsyncStream<BrowserReceiverEvent>.Continuation) async {
        var last: Int?
        for await frame in connection.frames {
            let message: BrowserMessage
            do {
                message = try BrowserMessage.decode(frame)
            } catch {
                return reject(connection, id, error.description, out)
            }
            if let last, message.sequence <= last {
                return reject(connection, id, "sequence \(message.sequence) does not follow \(last)", out)
            }
            last = message.sequence
            out.yield(.message(connection: id, message))
        }
        out.yield(.disconnected(connection: id))
    }

    private static func reject(_ connection: BrowserConnection, _ id: Int, _ reason: String, _ out: AsyncStream<BrowserReceiverEvent>.Continuation) {
        connection.close()
        out.yield(.rejected(connection: id, reason: reason))
    }
}
