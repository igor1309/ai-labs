/// Shares a model load between independent recognizers.
package actor SharedModel<Value: Sendable> {

    private let loadModel: @Sendable () async throws -> Value
    private var task: Task<Value, Error>?

    package init(load: @escaping @Sendable () async throws -> Value) {

        loadModel = load
    }

    package func load() -> Task<Value, Error> {

        if let task { return task }
        let loading = Task {
            do {
                return try await loadModel()
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
