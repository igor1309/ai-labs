/// Unbuffered, typed suspend/resume signaling between a producer and a consumer.
///
/// Signals sent before ``wait()`` are dropped — the gate is unbuffered by design.
public actor Gate<Response: Sendable> {

    private var continuation: CheckedContinuation<Response?, Never>?
    public private(set) var isCancelled = false

    public init() {}

    /// Suspends until ``signal(_:)`` or ``cancel()`` is called. Returns `nil` if cancelled.
    public func wait() async -> Response? {
        if isCancelled { return nil }
        return await withCheckedContinuation { continuation = $0 }
    }

    /// Resumes a pending ``wait()`` with the given response.
    public func signal(_ response: Response) {
        continuation?.resume(returning: response)
        continuation = nil
    }

    /// Marks the gate as cancelled and resumes a pending ``wait()`` with `nil`.
    public func cancel() {
        isCancelled = true
        continuation?.resume(returning: nil)
        continuation = nil
    }
}
