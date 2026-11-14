import CallNames
import Synchronization
import ZoomAccessibility

/// Watches Zoom's "Talking" indicator for one recording, polled only when Accessibility
/// is already granted, and reports each change in call time. Without the permission it
/// reports nothing and its stream ends at once.
final class ZoomCallObserver: CallAppObserver {

    static let interval = Duration.milliseconds(500)

    private let isPermitted: @Sendable () -> Bool
    private let windows: @Sendable () -> [Node]
    private let clock: @Sendable () async -> Double?
    private let sleep: @Sendable (Duration) async throws -> Void
    /// The open poll's stream, held only so stop can finish it.
    private let open = Mutex<AsyncStream<CallNamesEvent>.Continuation?>(nil)

    /// `clock` gives call time in seconds, or nil before recording starts.
    init(isPermitted: @escaping @Sendable () -> Bool, windows: @escaping @Sendable () -> [Node],
         clock: @escaping @Sendable () async -> Double?, sleep: @escaping @Sendable (Duration) async throws -> Void) {
        self.isPermitted = isPermitted; self.windows = windows; self.clock = clock; self.sleep = sleep
    }

    func observe() -> AsyncStream<CallNamesEvent> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesEvent.self)
        guard isPermitted() else {
            output.finish()
            return stream
        }
        open.withLock { $0 = output }
        let windows = windows, clock = clock, sleep = sleep
        let poll = Task {
            var transitions = Transitions()
            while !Task.isCancelled {
                if let time = await clock() {
                    for change in transitions.next(ZoomReading.read(windows: windows())) {
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
