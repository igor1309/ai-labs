import BrowserBridge
import CallNames
import CallObservation
import Synchronization

/// The local socket the Audelin browser extension's native host connects to,
/// opened for one recording: the connections it accepts, and a way to close
/// it.
public struct BrowserChannel: Sendable {
    public var connections: AsyncStream<BrowserConnection>
    public var stop: @Sendable () -> Void

    public init(connections: AsyncStream<BrowserConnection>, stop: @escaping @Sendable () -> Void) {
        self.connections = connections; self.stop = stop
    }
}

/// Watches the browser extension for one recording: opens its channel and reports
/// the roster and speaking it sends, placed on the monotonic clock, and which connections
/// have a clock. When the channel cannot open it reports nothing and its stream ends.
final class BrowserCallObserver: CallAppObserver {

    private let openBrowser: @Sendable () -> BrowserChannel?
    private let monotonic: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void
    private let log: any LogSink
    /// The open channel and its stream, held only so stop can close them.
    /// The most messages held for one connection before they can be placed; the oldest go first.
    static let heldLimit = 1000
    private let open = Mutex<(channel: BrowserChannel, output: AsyncStream<CallNamesEvent>.Continuation)?>(nil)

    /// `monotonic` times browser round trips in seconds; `sleep` spaces the pings.
    init(openBrowser: @escaping @Sendable () -> BrowserChannel?,
         monotonic: @escaping @Sendable () -> Double, sleep: @escaping @Sendable (Duration) async throws -> Void,
         log: any LogSink) {
        self.openBrowser = openBrowser; self.monotonic = monotonic; self.sleep = sleep; self.log = log
    }

    func observe() -> AsyncStream<CallNamesEvent> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesEvent.self)
        let log = log
        guard let opened = openBrowser() else {
            log.write(.init(category: .browser, message: "channel unavailable"))
            output.finish()
            return stream
        }
        open.withLock { $0 = (opened, output) }
        let receiver = BrowserReceiver(connections: opened.connections, now: monotonic, sleep: sleep)
        let listening = Task {
            // Each connection's clock places its messages on the app's monotonic clock.
            var clocks: [Int: BrowserClock] = [:]
            // A connection flushes what it buffered, including the roster, before its first clock reply.
            var held: [Int: [BrowserMessage]] = [:]
            func place(_ messages: [BrowserMessage], connection: Int) -> [BrowserMessage] {
                guard let offset = clocks[connection]?.offset() else { return messages }
                for (index, message) in messages.enumerated() {
                    let placed = BrowserObservation.event(message, connection: connection) { milliseconds in
                        milliseconds / 1000 - offset.time
                    }
                    guard let placed else { return Array(messages[index...]) }
                    log.write(.init(category: .browser, message: Self.describe(placed)))
                    output.yield(.browser(placed))
                }
                return []
            }
            for await event in receiver.events {
                switch event {
                case let .clock(connection, browserClock):
                    if clocks.updateValue(browserClock, forKey: connection) == nil {
                        log.write(.init(category: .browser, message: "connection=\(connection) clocked held=\(held[connection]?.count ?? 0)"))
                        output.yield(.browserConnected(connection))
                    }
                    if let waiting = held[connection], !waiting.isEmpty {
                        held[connection] = place(waiting, connection: connection)
                    }
                case let .disconnected(connection), let .rejected(connection, _):
                    if case let .rejected(_, reason) = event {
                        log.write(.init(category: .browser, message: "connection=\(connection) rejected", error: reason))
                    } else {
                        log.write(.init(category: .browser, message: "connection=\(connection) disconnected"))
                    }
                    held[connection] = nil
                    if clocks.removeValue(forKey: connection) != nil { output.yield(.browserDisconnected(connection)) }
                case let .message(connection, message):
                    var waiting = held[connection] ?? []
                    waiting.append(message)
                    if waiting.count > Self.heldLimit { waiting.removeFirst(waiting.count - Self.heldLimit) }
                    held[connection] = place(waiting, connection: connection)
                }
            }
            output.finish()
        }
        output.onTermination = { _ in listening.cancel() }
        return stream
    }

    /// One placed browser event for the log: its kind, time and counts, never a name.
    static func describe(_ event: Event) -> String {
        let head = "connection=\(event.epoch) sequence=\(event.sequence) time=\(String(format: "%.1f", event.time))"
        switch event.kind {
        case let .roster(members):
            return "\(head) roster members=\(members.count) local=\(members.filter(\.isLocal).count)"
        case let .speaking(memberID, speaking):
            return "\(head) speaking=\(speaking) member=\(memberID)"
        case .heartbeat:
            return "\(head) heartbeat"
        }
    }

    func stop() async {
        guard let (channel, output) = open.withLock({ open in defer { open = nil }; return open }) else { return }
        channel.stop()
        output.finish()
    }
}
