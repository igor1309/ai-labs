import Foundation

public struct EditNoteUseCase: Sendable {

    private let repoStore: any RepoStore
    private let snapshotRebuilder: SnapshotRebuilder

    public init(
        repoStore: any RepoStore,
        metadataSource: any MetadataSource,
        snapshotStore: any SnapshotStore
    ) {

        self.repoStore = repoStore
        self.snapshotRebuilder = SnapshotRebuilder(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: snapshotStore
        )
    }

    public func execute(
        id: UUID,
        note: String
    ) async throws -> SnapshotBlob {

        guard try await repoStore.findById(id) != nil else {
            throw EditNoteUseCaseError.notFound
        }

        let updateResult = try await repoStore.updateNote(id: id, note: note)
        if case .failure = updateResult {
            throw EditNoteUseCaseError.notFound
        }

        return try await snapshotRebuilder.rebuild()
    }
}
