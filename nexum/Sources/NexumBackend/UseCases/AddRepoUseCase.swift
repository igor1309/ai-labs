import Foundation

public struct AddRepoUseCase: Sendable {

    private let clock: @Sendable () -> Date
    private let repoStore: any RepoStore
    private let snapshotRebuilder: SnapshotRebuilder

    public init(
        repoStore: any RepoStore,
        metadataSource: any MetadataSource,
        snapshotStore: any SnapshotStore,
        clock: @escaping @Sendable () -> Date = Date.init
    ) {

        self.clock = clock
        self.repoStore = repoStore
        self.snapshotRebuilder = SnapshotRebuilder(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: snapshotStore
        )
    }

    public func execute(
        url: String,
        note: String
    ) async throws -> SnapshotBlob {

        let normalizedUrlResult = normalizeUrl(url)
        guard case let .success(normalizedUrl) = normalizedUrlResult else {
            throw AddRepoUseCaseError.invalidInput
        }

        let addResult = try await repoStore.add(url: normalizedUrl, note: note, addedAt: clock())
        if case let .failure(.duplicate(existingId)) = addResult {
            throw AddRepoUseCaseError.duplicate(existingId: existingId)
        }

        return try await snapshotRebuilder.rebuild()
    }
}
