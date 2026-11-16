import CallNames
import Synchronization
import ZoomAccessibility

/// Watches who speaks on Zoom's side for one recording, polled only when Accessibility
/// is already granted, and reports each change in call time. Without the permission it
/// reports nothing and its stream ends at once. The user's Zoom name tells their tile
/// from the others; each name Zoom shows for the user is remembered for later calls.
final class ZoomCallObserver: CallAppObserver {

    static let interval = Duration.milliseconds(500)

    private let isPermitted: @Sendable () -> Bool
    private let windows: @Sendable () -> [Node]
    private let clock: @Sendable () async -> Double?
    private let sleep: @Sendable (Duration) async throws -> Void
    private let knownName: @Sendable () -> String?
    private let rememberName: @Sendable (String) -> Void
    /// The open poll's stream, held only so stop can finish it.
    private let open = Mutex<AsyncStream<CallNamesEvent>.Continuation?>(nil)

    /// `clock` gives call time in seconds, or nil before recording starts.
    init(isPermitted: @escaping @Sendable () -> Bool, windows: @escaping @Sendable () -> [Node],
         clock: @escaping @Sendable () async -> Double?, sleep: @escaping @Sendable (Duration) async throws -> Void,
         knownName: @escaping @Sendable () -> String?, rememberName: @escaping @Sendable (String) -> Void) {
        self.isPermitted = isPermitted; self.windows = windows; self.clock = clock; self.sleep = sleep
        self.knownName = knownName; self.rememberName = rememberName
    }

    func observe() -> AsyncStream<CallNamesEvent> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesEvent.self)
        guard isPermitted() else {
            output.finish()
            return stream
        }
        open.withLock { $0 = output }
        let windows = windows, clock = clock, sleep = sleep, rememberName = rememberName
        let poll = Task { [knownName] in
            var transitions = Transitions()
            var known = knownName()
            while !Task.isCancelled {
                if let time = await clock() {
                    let reading = ZoomReading.read(windows: windows())
                    if let own = reading.ownName, own != known {
                        rememberName(own)
                        known = own
                    }
                    for change in transitions.next(reading, known: known) {
                        output.yield(.zoom(Self.change(change), at: time))
                    }
                    output.yield(.tick(now: time))
                }
                do { try await sleep(Self.interval) } catch { break }
            }
            output.finish()
        }
        output.onTermination = { _ in poll.cancel() }
        return stream
    }

    func stop() async {
        open.withLock { open in defer { open = nil }; return open }?.finish()
    }

    private static func change(_ change: Change) -> ZoomChange {
        switch change {
        case let .started(name): .started(name)
        case let .stopped(name): .stopped(name)
        case .observed: .observed
        case .lost: .lost
        }
    }
}
