import Foundation

struct SnapshotRebuilder: Sendable {

    let repoStore: any RepoStore
    let metadataSource: any MetadataSource
    let snapshotStore: any SnapshotStore

    func rebuild() async throws -> SnapshotBlob {
        let previousSnapshot = try await snapshotStore.read()
        let entries = try await repoStore.list()

        var metadataByRepoId = [UUID: Result<RepoMetadata, Error>]()
        for entry in entries {
            do {
                let metadata = try await metadataSource.fetch(url: entry.repoUrl)
                metadataByRepoId[entry.id] = .success(metadata)
            } catch {
                metadataByRepoId[entry.id] = .failure(error)
            }
        }

        let snapshot = buildSnapshot(
            entries: entries,
            metadataResults: metadataByRepoId,
            previousSnapshot: previousSnapshot
        )

        try await snapshotStore.write(snapshot)
        return snapshot
    }
}
