import Composer
import Dispatch
import Synchronization

/// One call app as Core Audio shows it: Zoom, whose microphone input the
/// rehearsal turns on to start a call and off to end it, so detection runs.
public final class RehearsalCallApp: CallProcessSource, Sendable {

    private struct State {

        var input = false
        var listeners: [UInt64: @Sendable () -> Void] = [:]
        var next: UInt64 = 0
    }

    private static let object: UInt32 = 1
    private let state = Mutex(State())

    public init() {}

    /// The app opens its microphone, as a call starts.
    public func join() { setInput(true) }

    /// The app closes its microphone; detection ends the call after its grace period.
    public func leave() { setInput(false) }

    public func processObjects() -> [UInt32] { [Self.object] }
    public func pid(of object: UInt32) -> Int32? { object == Self.object ? 99_999 : nil }
    public func bundleID(of object: UInt32) -> String? { object == Self.object ? "us.zoom.xos" : nil }
    public func name(of object: UInt32) -> String { object == Self.object ? "zoom.us" : "" }
    public func isRunningInput(_ object: UInt32) -> Bool { object == Self.object && state.withLock { $0.input } }

    /// The process list never changes.
    public func onProcessListChange(_ changed: @escaping @Sendable () -> Void) -> BoundaryCancellation {
        BoundaryCancellation {}
    }

    public func onProcessChange(_ object: UInt32, _ changed: @escaping @Sendable () -> Void) -> BoundaryCancellation {
        let id = state.withLock { state in
            state.next += 1
            state.listeners[state.next] = changed
            return state.next
        }
        return BoundaryCancellation { [weak self] in _ = self?.state.withLock { $0.listeners.removeValue(forKey: id) } }
    }

    private func setInput(_ input: Bool) {
        let listeners = state.withLock { state in
            state.input = input
            return Array(state.listeners.values)
        }
        // Core Audio tells changes on its own threads, never the caller's.
        DispatchQueue.global().async { listeners.forEach { $0() } }
    }
}
