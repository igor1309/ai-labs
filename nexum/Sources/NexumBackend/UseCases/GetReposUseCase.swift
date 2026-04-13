public struct GetReposUseCase: Sendable {

    private let snapshotStore: any SnapshotStore

    public init(snapshotStore: any SnapshotStore) {

        self.snapshotStore = snapshotStore
    }

    public func execute() async throws -> SnapshotBlob {
        if let snapshot = try await snapshotStore.read() {
            return snapshot
        }
        return SnapshotBlob(repos: [])
    }
}
