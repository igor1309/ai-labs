import CallNames
import Synchronization
import ZoomAccessibility

/// Reports Zoom's speaker reading at each poll's monotonic instant when Accessibility
/// is already granted. Without permission the stream ends at once. The user's Zoom
/// name distinguishes their tile and is remembered for later calls.
final class ZoomCallObserver: CallAppObserver {

    static let interval = Duration.milliseconds(500)

    private let isPermitted: @Sendable () -> Bool
    private let windows: @Sendable () -> [Node]
    private let now: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void
    private let knownName: @Sendable () -> String?
    private let rememberName: @Sendable (String) -> Void
    /// The open poll's stream, held only so stop can finish it.
    private let open = Mutex<AsyncStream<CallNamesUpdate>.Continuation?>(nil)

    init(isPermitted: @escaping @Sendable () -> Bool, windows: @escaping @Sendable () -> [Node],
         now: @escaping @Sendable () -> Double, sleep: @escaping @Sendable (Duration) async throws -> Void,
         knownName: @escaping @Sendable () -> String?, rememberName: @escaping @Sendable (String) -> Void) {
        self.isPermitted = isPermitted; self.windows = windows; self.now = now; self.sleep = sleep
        self.knownName = knownName; self.rememberName = rememberName
    }

    func observe() -> AsyncStream<CallNamesUpdate> {
        let (stream, output) = AsyncStream.makeStream(of: CallNamesUpdate.self)
        guard isPermitted() else {
            output.finish()
            return stream
        }
        open.withLock { $0 = output }
        let windows = windows, now = now, sleep = sleep, rememberName = rememberName
        let poll = Task { [knownName] in
            var known = knownName()
            while !Task.isCancelled {
                let instant = now()
                let reading = ZoomReading.read(windows: windows())
                if let own = reading.ownName, own != known {
                    rememberName(own)
                    known = own
                }
                let report: ZoomPoll = if !reading.inMeeting {
                    .unavailable
                } else if let speaker = ZoomReading.speaker(in: reading, known: known) {
                    .speaker(speaker)
                } else {
                    .nobody
                }
                output.yield(.zoom(report, at: instant))
                output.yield(.tick(now: instant))
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
}
