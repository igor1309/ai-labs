public protocol SnapshotStore: Sendable {

    func read() async throws -> SnapshotBlob?
    func write(_ blob: SnapshotBlob) async throws
}
