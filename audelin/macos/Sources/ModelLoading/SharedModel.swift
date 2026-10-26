import Dispatch

/// Shares a model load between independent recognizers.
package actor SharedModel<Value: Sendable> {

    private let loadQueue: DispatchQueue
    private let loadModel: @Sendable () async throws -> Value
    private var task: Task<Value, Error>?

    package init(
        loadQueue: DispatchQueue = DispatchQueue(label: "audelin.ModelLoading"),
        load: @escaping @Sendable () async throws -> Value
    ) {

        self.loadQueue = loadQueue
        loadModel = load
    }

    package func load() -> Task<Value, Error> {

        if let task { return task }
        let loading = Task {
            do {
                // The SDK's nonisolated async calls must keep blocking reads off
                // the cooperative pool, including after suspension.
                return try await withTaskExecutorPreference(loadQueue) {
                    try await loadModel()
                }
            } catch {
                // Clear before reporting failure so any waiter can retry.
                task = nil
                throw error
            }
        }
        task = loading
        return loading
    }
}
