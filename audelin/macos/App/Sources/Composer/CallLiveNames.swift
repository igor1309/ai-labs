import BrowserBridge
import CallObservation
import SpeakerNaming
import ZoomAccessibility

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

/// Gives remote rows tentative names during one recording, from what the call
/// app shows: Zoom's "Talking" indicator, polled when Accessibility is already
/// granted, and the browser extension's roster and speaking events, when its
/// channel opens and the extension connects. Recording never depends on
/// either; without them the rows stay unnamed.
actor CallLiveNames {

    /// The indicator lags speech and is polled; each interval edge is trusted only this far.
    static let uncertainty = 0.5
    static let interval = Duration.milliseconds(500)

    private let windows = ZoomWindows()
    private let openBrowser: @Sendable () -> BrowserChannel?
    private let monotonic: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void
    private var zoom = CallObservation()
    private var transitions = Transitions()
    private var sequence = 0
    private var known: [String] = []
    private var browser = CallObservation()
    /// Each open browser connection's clock, by connection.
    private var clocks: [Int: BrowserClock] = [:]
    private var live = LiveNames()
    private var clock: (@Sendable () async -> Double?)?
    private var poll: Task<Void, Never>?
    private var listening: Task<Void, Never>?
    private var channel: BrowserChannel?

    /// `openBrowser` opens the extension's channel, or gives nil when it
    /// cannot; `monotonic` is the clock in seconds that browser round trips
    /// are timed by, and `sleep` spaces the clock pings.
    init(openBrowser: @escaping @Sendable () -> BrowserChannel?, monotonic: @escaping @Sendable () -> Double,
         sleep: @escaping @Sendable (Duration) async throws -> Void) {

        self.openBrowser = openBrowser; self.monotonic = monotonic; self.sleep = sleep
    }

    /// `clock` gives call time in seconds, or nil before recording starts.
    func start(clock: @escaping @Sendable () async -> Double?) {

        LiveNameBoard.shared.reset()
        guard self.clock == nil else { return }
        self.clock = clock
        if let channel = openBrowser() {
            self.channel = channel
            let receiver = BrowserReceiver(connections: channel.connections, now: monotonic, sleep: sleep)
            listening = Task { [weak self] in
                for await event in receiver.events {
                    guard let self else { return }
                    await self.receive(event, clock: clock)
                }
            }
        }
        guard windows.isPermitted else { return }
        poll = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.read(clock: clock)
                try? await Task.sleep(for: Self.interval)
            }
        }
    }

    func stop() {

        poll?.cancel()
        poll = nil
        listening?.cancel()
        listening = nil
        channel?.stop()
        channel = nil
    }

    private func read(clock: @Sendable () async -> Double?) async {

        guard let time = await clock() else { return }
        let reading = ZoomReading.read(windows: windows.windows())
        for change in transitions.next(reading) { receive(change, at: time) }
        zoom.tick(now: time)
    }

    private func receive(_ change: Change, at time: Double) {

        func send(_ kind: Event.Kind) {
            sequence += 1
            zoom.receive(.init(epoch: 1, sequence: sequence, time: time, kind: kind))
        }
        switch change {
        case let .started(name):
            // Zoom exposes display names only, so a name is the participant's identity.
            if !known.contains(name) {
                known.append(name)
                send(.roster(known.map { Member(id: $0, name: $0) }))
            }
            send(.speaking(memberID: name, true))
        case let .stopped(name): send(.speaking(memberID: name, false))
        case .observed: send(.heartbeat)
        case .lost: break
        }
    }

    private func receive(_ event: BrowserReceiverEvent, clock: @Sendable () async -> Double?) async {

        switch event {
        case let .clock(connection, browserClock):
            clocks[connection] = browserClock
        case let .disconnected(connection), let .rejected(connection, _):
            clocks[connection] = nil
        case let .message(connection, message):
            guard let now = await clock() else { return }
            // Round trips are timed on the monotonic clock; the call started this far into it.
            let start = monotonic() - now
            let browserClock = clocks[connection]
            let event = BrowserObservation.event(message, connection: connection) { milliseconds in
                browserClock?.callTime(ofBrowser: milliseconds).map { max(0, $0.time - start) }
            }
            if let event { browser.receive(event) }
        }
    }

    /// Names for remote rows, keyed by the row's local ID; a given name never changes.
    func names(for rows: [(id: Int, start: Double, end: Double)]) async -> [Int: String] {

        var snapshot = zoom.snapshot
        if !browser.snapshot.members.isEmpty {
            snapshot = browser.snapshot
            // The extension reports every change at once and sends nothing
            // between them, so while it is connected its silence is knowledge.
            if !clocks.isEmpty, let now = await clock?() { snapshot.through = max(snapshot.through, now) }
        }
        let roster = snapshot.members.map { Participant(id: $0.id, name: $0.name, isLocal: $0.isLocal) }
        let activities = snapshot.intervals.map {
            Activity(participantID: $0.memberID, start: $0.start, end: $0.end, uncertainty: Self.uncertainty)
        }
        var result: [Int: String] = [:]
        for row in rows {
            if let name = live.name(row: String(row.id), start: row.start, end: row.end,
                                    roster: roster, activities: activities, through: snapshot.through) {
                result[row.id] = name
            }
        }
        LiveNameBoard.shared.give(result)
        let names = Dictionary(snapshot.members.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        LiveNameBoard.shared.record(roster: snapshot.members.filter { !$0.isLocal }.map(\.name),
                                    spoken: snapshot.intervals.map { (names[$0.memberID] ?? $0.memberID, $0.start, $0.end) },
                                    through: snapshot.through)
        return result
    }
}
