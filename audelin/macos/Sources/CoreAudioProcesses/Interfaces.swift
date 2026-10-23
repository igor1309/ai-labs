/// Core Audio's id for one of its process objects.
public typealias ProcessObject = UInt32

/// What the adapter needs from Core Audio's process objects. Notifications
/// arrive outside registration; cancellation never waits for a callback.
public protocol ProcessBinding: Sendable {

    /// The process objects Core Audio knows: the processes with audio open.
    func processObjects() throws -> [ProcessObject]

    /// Nil once the object is gone.
    func pid(of object: ProcessObject) -> Int32?

    func bundleID(of object: ProcessObject) -> String?

    /// The executable's name for a process with no bundle id.
    func name(of object: ProcessObject) -> String

    /// Whether the process is using the microphone. Core Audio never tells
    /// a change of it on its own.
    func isRunningInput(_ object: ProcessObject) -> Bool

    /// Tells each time the process list changes.
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation

    /// Tells each time the process's `IsRunning` or device list changes.
    func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation
}

/// Where the adapter counts the wait before a call ends.
public protocol CallClock: Sendable {

    /// Calls `fire` once `delay` has passed, unless cancelled first.
    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation
}

/// Stops a listener or a wait. Already queued callbacks may still arrive.
public struct Cancellation: Sendable {

    private let cancellation: @Sendable () -> Void

    public init(_ cancellation: @escaping @Sendable () -> Void) {

        self.cancellation = cancellation
    }

    public func cancel() {

        cancellation()
    }
}
