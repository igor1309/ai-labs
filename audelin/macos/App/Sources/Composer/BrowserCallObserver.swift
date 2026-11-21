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

/// Watches the browser extension: opens its channel and reports
/// the roster and speaking it sends at monotonic instants, and which connections
/// have a clock. When the channel cannot open it reports nothing and its stream ends.
final class BrowserCallObserver: CallAppObserver {

    private let openBrowser: @Sendable () -> BrowserChannel?
    private let monotonic: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void
    private let log: any LogSink
    /// The most messages held for one connection before calibration. The oldest go first.
    static let heldLimit = 1000
    /// The open channel and its stream, held only so stop can close them.
    private let open = Mutex<(channel: BrowserChannel, output: AsyncStream<CallNamesUpdate>.Continuation)?>(nil)

    /// `monotonic` times browser round trips in seconds. `sleep` spaces the pings.
    init(openBrowser: @escaping @Sendable () -> BrowserChannel?,
         monotonic: @escaping @Sendable () -> Double, sleep: @escaping @Sendable (Duration) async throws -> Void,
         log: any LogSink) {
        self.openBrowser = openBrowser; self.monotonic = monotonic; self.sleep = sleep; self.log = log
    }

    func observe() -> AsyncStream<CallNamesUpdate> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesUpdate.self)
        let log = log
        guard let opened = openBrowser() else {
            log.write(.init(category: .browser, message: "channel unavailable"))
            output.finish()
            return stream
        }
        open.withLock { $0 = (opened, output) }
        let receiver = BrowserReceiver(connections: opened.connections, now: monotonic, sleep: sleep)
        let listening = Task {
            var offsets: [Int: Double] = [:]
            // The extension flushes its roster before its first clock reply.
            var held: [Int: [BrowserMessage]] = [:]
            func report(_ message: BrowserMessage, connection: Int, offset: Double) {
                // Preserve the estimated instant, including times before the monotonic origin.
                guard let event = BrowserObservation.event(message, connection: connection, callTime: {
                    $0 / 1000 - offset
                }) else { return }
                log.write(.init(category: .browser, message: Self.describe(event)))
                output.yield(.browser(event))
            }
            for await event in receiver.events {
                switch event {
                case let .clock(connection, browserClock):
                    guard let offset = browserClock.offset()?.time,
                          offsets.updateValue(offset, forKey: connection) == nil else { continue }
                    let waiting = held.removeValue(forKey: connection) ?? []
                    log.write(.init(category: .browser, message: "connection=\(connection) clocked held=\(waiting.count)"))
                    output.yield(.browserConnected(connection))
                    for message in waiting { report(message, connection: connection, offset: offset) }
                case let .disconnected(connection), let .rejected(connection, _):
                    if case let .rejected(_, reason) = event {
                        log.write(.init(category: .browser, message: "connection=\(connection) rejected", error: reason))
                    } else {
                        log.write(.init(category: .browser, message: "connection=\(connection) disconnected"))
                    }
                    held[connection] = nil
                    if offsets.removeValue(forKey: connection) != nil { output.yield(.browserDisconnected(connection)) }
                case let .message(connection, message):
                    if let offset = offsets[connection] {
                        report(message, connection: connection, offset: offset)
                    } else {
                        var waiting = held.removeValue(forKey: connection) ?? []
                        waiting.append(message)
                        if waiting.count > Self.heldLimit { waiting.removeFirst() }
                        held[connection] = waiting
                    }
                }
            }
            output.finish()
        }
        output.onTermination = { _ in listening.cancel() }
        return stream
    }

    /// A browser event's kind, monotonic instant and counts, with names omitted.
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
