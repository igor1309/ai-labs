import Foundation

/// One connection from the extension's native-messaging host: the frames it
/// delivers, already cut at their length prefix, a way to send it a frame and
/// a way to close it. The frames end when the peer disconnects.
public struct BrowserConnection: Sendable {
    public var frames: AsyncStream<Data>
    public var send: @Sendable (Data) async throws -> Void
    public var close: @Sendable () -> Void

    public init(frames: AsyncStream<Data>, send: @Sendable @escaping (Data) async throws -> Void,
                close: @Sendable @escaping () -> Void) {
        self.frames = frames; self.send = send; self.close = close
    }
}

/// What the receiver reports, per connection in the order the transport
/// accepted it.
public enum BrowserReceiverEvent: Equatable, Sendable {
    case message(connection: Int, BrowserMessage)
    /// The extension answered a clock ping; the connection's clock with that
    /// round trip recorded. A connection starts with an empty clock, and its
    /// clock is gone once it disconnects or is rejected.
    case clock(connection: Int, BrowserClock)
    /// The connection sent a frame that is not a valid message, or a sequence
    /// that does not increase; the receiver closed it.
    case rejected(connection: Int, reason: String)
    /// The peer ended the connection.
    case disconnected(connection: Int)
}

/// Accepts connections from the transport, decodes each frame and publishes
/// the results as one stream. A bad frame or a replayed sequence closes its
/// connection; other connections go on. Each connection is pinged for the
/// extension's clock when it arrives and then every `interval`; the replies
/// build its `BrowserClock`, timed by `now`, a monotonic clock in seconds.
/// Ending the event stream closes every open connection.
public struct BrowserReceiver: Sendable {
    public let events: AsyncStream<BrowserReceiverEvent>

    /// `sleep` waits out the interval between pings and throws when cancelled.
    public init(connections: AsyncStream<BrowserConnection>,
                now: @escaping @Sendable () -> Double,
                sleep: @escaping @Sendable (Duration) async throws -> Void,
                interval: Duration = .seconds(5)) {
        let (events, continuation) = AsyncStream<BrowserReceiverEvent>.makeStream()
        self.events = events
        let task = Task {
            await withTaskGroup(of: Void.self) { group in
                var index = 0
                for await connection in connections {
                    let id = index
                    index += 1
                    group.addTask {
                        await Self.serve(connection, id: id, now: now, sleep: sleep, interval: interval, into: continuation)
                    }
                }
            }
            continuation.finish()
        }
        continuation.onTermination = { _ in task.cancel() }
    }

    /// What one connection's loop handles in order: a frame from the peer, a
    /// ping about to go out, or the end of the frames.
    private enum Input: Sendable {
        case frame(Data), pinging(Int, sent: Double), ended
    }

    private static func serve(_ connection: BrowserConnection, id: Int,
                              now: @escaping @Sendable () -> Double,
                              sleep: @escaping @Sendable (Duration) async throws -> Void,
                              interval: Duration,
                              into out: AsyncStream<BrowserReceiverEvent>.Continuation) async {
        let (inputs, input) = AsyncStream<Input>.makeStream()
        let reading = Task {
            for await frame in connection.frames { input.yield(.frame(frame)) }
            input.yield(.ended)
        }
        // A ping is announced before it is sent, so its reply always finds it.
        let pinging = Task {
            var ping = 0
            while !Task.isCancelled {
                input.yield(.pinging(ping, sent: now()))
                do {
                    try await connection.send(BrowserClockReply.ping(ping))
                    try await sleep(interval)
                } catch { return }
                ping += 1
            }
        }
        defer { reading.cancel(); pinging.cancel(); input.finish() }

        var last: Int?
        var pending: [Int: Double] = [:]
        var clock = BrowserClock()
        for await item in inputs {
            let frame: Data
            switch item {
            case .ended:
                out.yield(.disconnected(connection: id)); return
            case let .pinging(ping, sent):
                // A reply later than eight newer pings is too stale to keep.
                pending[ping] = sent
                pending = pending.filter { $0.key > ping - 8 }
                continue
            case let .frame(data):
                frame = data
            }
            if let reply = BrowserClockReply.decode(frame) {
                if let sent = pending.removeValue(forKey: reply.ping) {
                    clock.record(.init(sent: sent, received: now(), browser: reply.at))
                    out.yield(.clock(connection: id, clock))
                }
                continue
            }
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
        // The receiver was cancelled: the connection is no longer wanted.
        connection.close()
    }

    private static func reject(_ connection: BrowserConnection, _ id: Int, _ reason: String, _ out: AsyncStream<BrowserReceiverEvent>.Continuation) {
        connection.close()
        out.yield(.rejected(connection: id, reason: reason))
    }
}
