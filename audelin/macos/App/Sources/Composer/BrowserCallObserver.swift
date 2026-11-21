import BrowserBridge
import CallNames
import CallObservation
import Synchronization

/// The local socket the Audelin browser extension's native host connects to,
/// with the connections it accepts and a way to close it.
public struct BrowserChannel: Sendable {
    public var connections: AsyncStream<BrowserConnection>
    public var stop: @Sendable () -> Void

    public init(connections: AsyncStream<BrowserConnection>, stop: @escaping @Sendable () -> Void) {
        self.connections = connections; self.stop = stop
    }
}

/// Owns the app's socket and receiver and fans out their ordered reports.
final class SharedBrowserObservations: Sendable {
    private let channel: BrowserChannel?
    private let listening: Task<Void, Never>?
    private let feed = BrowserReceiverFeed()

    init(open: @Sendable () -> BrowserChannel?, monotonic: @escaping @Sendable () -> Double,
         sleep: @escaping @Sendable (Duration) async throws -> Void, log: any LogSink) {
        channel = open()
        guard let channel else {
            log.write(.init(category: .browser, message: "channel unavailable"))
            listening = nil
            feed.finish()
            return
        }
        let receiver = BrowserReceiver(connections: channel.connections, now: monotonic, sleep: sleep)
        listening = Task { [feed] in
            for await event in receiver.events {
                feed.publish(event)
            }
            feed.finish()
        }
    }

    func subscribe() -> BrowserReceiverFeed.Subscription { feed.subscribe() }

    deinit {
        listening?.cancel()
        channel?.stop()
        feed.finish()
    }
}

/// A new watch joins already calibrated connections before seeing their next
/// message. Snapshotting and registration must agree with publication order.
final class BrowserReceiverFeed: Sendable {
    struct Subscription: Sendable {
        let events: AsyncStream<BrowserReceiverEvent>
        let stop: @Sendable () -> Void
    }

    private struct State {
        var connections: [Int: Connection] = [:]
        var subscribers: [Int: AsyncStream<BrowserReceiverEvent>.Continuation] = [:]
        var next = 0
        var finished = false
    }

    private struct Connection {
        var clock: BrowserClock?
        private var pending: [BrowserMessage] = []
        private var roster: BrowserMessage?
        private var speaking: [String: BrowserMessage] = [:]
        private var lastSequence: Int?

        mutating func receive(_ message: BrowserMessage, deliverLive: Bool) {
            if deliverLive {
                remember(message)
            } else {
                pending.append(message)
                if pending.count > BrowserCallObserver.heldLimit { remember(pending.removeFirst()) }
            }
        }

        mutating func bootstrap() -> [BrowserMessage] {
            let limit = BrowserCallObserver.heldLimit
            // A watch can receive the whole bootstrap before it can place any of it.
            // Fold older backlog entries into the snapshot to leave room for the roster.
            while !pending.isEmpty, pending.count + speaking.count + (roster == nil ? 0 : 1) > limit {
                remember(pending.removeFirst())
            }
            let rosterCount = roster == nil ? 0 : 1
            let starts = speaking.values.sorted { $0.sequence < $1.sequence }.suffix(limit - rosterCount)
            var messages = (Array(starts) + [roster].compactMap { $0 }).sorted { $0.sequence < $1.sequence }
            if let lastSequence {
                // The snapshot already accounts for earlier gaps. End it at the
                // last received sequence so omitted history does not close live speech.
                for index in messages.indices {
                    messages[index].sequence = lastSequence - (messages.count - 1 - index)
                }
            }
            messages.append(contentsOf: pending)
            for message in pending { remember(message) }
            pending.removeAll()
            return messages
        }

        private mutating func remember(_ message: BrowserMessage) {
            if let lastSequence, message.sequence != lastSequence + 1 { speaking.removeAll() }
            lastSequence = message.sequence
            switch message.event {
            case .roster:
                roster = message
            case .callEnded:
                roster = message
                speaking.removeAll()
            case let .speakingStarted(_, id):
                if speaking[id] == nil { speaking[id] = message }
            case let .speakingStopped(_, id):
                speaking[id] = nil
            }
        }
    }

    private let state = Mutex(State())

    func subscribe() -> Subscription {
        let (stream, output) = AsyncStream<BrowserReceiverEvent>.makeStream()
        let id = state.withLock { state -> Int? in
            guard !state.finished else { return nil }
            for id in state.connections.keys.sorted() {
                guard var connection = state.connections[id] else { continue }
                for message in connection.bootstrap() { output.yield(.message(connection: id, message)) }
                if let clock = connection.clock { output.yield(.clock(connection: id, clock)) }
                state.connections[id] = connection
            }
            let id = state.next
            state.next += 1
            state.subscribers[id] = output
            return id
        }
        if let id {
            output.onTermination = { [weak self] _ in self?.remove(id) }
        } else {
            output.finish()
        }
        return Subscription(events: stream, stop: { [weak self] in
            if let id { self?.remove(id) }
            output.finish()
        })
    }

    func publish(_ event: BrowserReceiverEvent) {
        let subscribers = state.withLock { state in
            switch event {
            case let .clock(connection, clock): state.connections[connection, default: Connection()].clock = clock
            case let .disconnected(connection), let .rejected(connection, _):
                state.connections[connection] = nil
            case let .message(connection, message):
                state.connections[connection, default: Connection()].receive(message, deliverLive: !state.subscribers.isEmpty)
            }
            return Array(state.subscribers.values)
        }
        for output in subscribers { output.yield(event) }
    }

    func finish() {
        let subscribers = state.withLock { state in
            state.finished = true
            state.connections.removeAll()
            defer { state.subscribers.removeAll() }
            return Array(state.subscribers.values)
        }
        for output in subscribers { output.finish() }
    }

    private func remove(_ id: Int) { state.withLock { $0.subscribers[id] = nil } }
}

/// Places the shared receiver's observations on one recording's call clock.
final class BrowserCallObserver: CallAppObserver {
    private let browser: SharedBrowserObservations
    private let clock: @Sendable () async -> Double?
    private let monotonic: @Sendable () -> Double
    private let log: any LogSink
    /// The most messages held for one connection before they can be placed; the oldest go first.
    static let heldLimit = 1000
    private let open = Mutex<AsyncStream<CallNamesUpdate>.Continuation?>(nil)

    /// `clock` gives call time in seconds, or nil before recording starts.
    init(browser: SharedBrowserObservations, clock: @escaping @Sendable () async -> Double?,
         monotonic: @escaping @Sendable () -> Double, log: any LogSink) {
        self.browser = browser; self.clock = clock; self.monotonic = monotonic; self.log = log
    }

    func observe() -> AsyncStream<CallNamesUpdate> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesUpdate.self)
        let subscription = browser.subscribe()
        open.withLock { $0 = output }
        let clock = clock, monotonic = monotonic, log = log
        let listening = Task {
            // Each connection's clock, used only to place its messages on the call clock.
            var clocks: [Int: BrowserClock] = [:]
            // Messages that came before their connection's clock or before recording started,
            // held in order until they can be placed. A connection flushes what it buffered
            // as soon as it connects, before its first clock reply, and that holds the roster.
            var held: [Int: [BrowserMessage]] = [:]
            func place(_ messages: [BrowserMessage], connection: Int) async -> [BrowserMessage] {
                guard let browserClock = clocks[connection], let now = await clock() else { return messages }
                // Round trips are timed on the monotonic clock; the call started this far into it.
                let start = monotonic() - now
                for (index, message) in messages.enumerated() {
                    let placed = BrowserObservation.event(message, connection: connection) { milliseconds in
                        browserClock.callTime(ofBrowser: milliseconds).map { max(0, $0.time - start) }
                    }
                    guard let placed else { return Array(messages[index...]) }
                    log.write(.init(category: .browser, message: Self.describe(placed)))
                    output.yield(.browser(placed))
                }
                return []
            }
            for await event in subscription.events {
                switch event {
                case let .clock(connection, browserClock):
                    if clocks.updateValue(browserClock, forKey: connection) == nil {
                        log.write(.init(category: .browser, message: "connection=\(connection) clocked held=\(held[connection]?.count ?? 0)"))
                        output.yield(.browserConnected(connection))
                    }
                    if let waiting = held[connection], !waiting.isEmpty {
                        held[connection] = await place(waiting, connection: connection)
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
                    held[connection] = await place(waiting, connection: connection)
                }
            }
            output.finish()
        }
        output.onTermination = { _ in
            subscription.stop()
            listening.cancel()
        }
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
        open.withLock { open in defer { open = nil }; return open }?.finish()
    }
}
