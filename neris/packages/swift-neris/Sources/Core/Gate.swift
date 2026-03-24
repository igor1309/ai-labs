public actor Gate<Response: Sendable> {

    private var continuation: CheckedContinuation<Response?, Never>?
    public private(set) var isCancelled = false

    public init() {}

    public func wait() async -> Response? {
        if isCancelled { return nil }
        return await withCheckedContinuation { continuation = $0 }
    }

    public func signal(_ response: Response) {
        continuation?.resume(returning: response)
        continuation = nil
    }

    public func cancel() {
        isCancelled = true
        continuation?.resume(returning: nil)
        continuation = nil
    }
}
