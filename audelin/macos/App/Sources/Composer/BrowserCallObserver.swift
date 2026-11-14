import BrowserBridge
import CallNames
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
/// the roster and speaking it sends, placed on the call clock, and which connections
/// have a clock. When the channel cannot open it reports nothing and its stream ends.
final class BrowserCallObserver: CallAppObserver {

    private let openBrowser: @Sendable () -> BrowserChannel?
    private let clock: @Sendable () async -> Double?
    private let monotonic: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void
    /// The open channel and its stream, held only so stop can close them.
    private let open = Mutex<(channel: BrowserChannel, output: AsyncStream<CallNamesEvent>.Continuation)?>(nil)

    /// `clock` gives call time in seconds, or nil before recording starts; `monotonic`
    /// is the clock in seconds browser round trips are timed by; `sleep` spaces the pings.
    init(openBrowser: @escaping @Sendable () -> BrowserChannel?, clock: @escaping @Sendable () async -> Double?,
         monotonic: @escaping @Sendable () -> Double, sleep: @escaping @Sendable (Duration) async throws -> Void) {
        self.openBrowser = openBrowser; self.clock = clock; self.monotonic = monotonic; self.sleep = sleep
    }

    func observe() -> AsyncStream<CallNamesEvent> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesEvent.self)
        guard let opened = openBrowser() else {
            output.finish()
            return stream
        }
        open.withLock { $0 = (opened, output) }
        let receiver = BrowserReceiver(connections: opened.connections, now: monotonic, sleep: sleep)
        let clock = clock, monotonic = monotonic
        let listening = Task {
            // Each connection's clock, used only to place its messages on the call clock.
            var clocks: [Int: BrowserClock] = [:]
            for await event in receiver.events {
                switch event {
                case let .clock(connection, browserClock):
                    if clocks.updateValue(browserClock, forKey: connection) == nil { output.yield(.browserConnected(connection)) }
                case let .disconnected(connection), let .rejected(connection, _):
                    if clocks.removeValue(forKey: connection) != nil { output.yield(.browserDisconnected(connection)) }
                case let .message(connection, message):
                    guard let now = await clock() else { continue }
                    // Round trips are timed on the monotonic clock; the call started this far into it.
                    let start = monotonic() - now
                    let browserClock = clocks[connection]
                    let placed = BrowserObservation.event(message, connection: connection) { milliseconds in
                        browserClock?.callTime(ofBrowser: milliseconds).map { max(0, $0.time - start) }
                    }
                    if let placed { output.yield(.browser(placed)) }
                }
            }
            output.finish()
        }
        output.onTermination = { _ in listening.cancel() }
        return stream
    }

    func stop() async {
        guard let (channel, output) = open.withLock({ open in defer { open = nil }; return open }) else { return }
        channel.stop()
        output.finish()
    }
}
