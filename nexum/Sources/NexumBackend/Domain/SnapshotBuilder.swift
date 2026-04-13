import Foundation

public func buildSnapshot(
    entries: [RepoEntry],
    metadataResults: [UUID: Result<RepoMetadata, Error>],
    previousSnapshot: SnapshotBlob?
) -> SnapshotBlob {
    let previousMetadataById = Dictionary(uniqueKeysWithValues: (previousSnapshot?.repos ?? []).map { repo in
        (
            repo.id,
            RepoMetadata(
                name: repo.name ?? "",
                stars: repo.stars ?? 0,
                description: repo.description
            )
        )
    })

    let repos = entries
        .sorted {
            if $0.addedAt == $1.addedAt {
                return $0.id.uuidString < $1.id.uuidString
            }
            return $0.addedAt < $1.addedAt
        }
        .map { entry in
            let selectedMetadata = selectMetadata(
                entryId: entry.id,
                metadataResults: metadataResults,
                previousMetadataById: previousMetadataById,
                previousSnapshot: previousSnapshot
            )

            return SnapshotRepoEntry(
                id: entry.id,
                repoUrl: entry.repoUrl,
                name: selectedMetadata?.name,
                stars: selectedMetadata?.stars,
                description: selectedMetadata?.description,
                note: entry.note,
                addedAt: entry.addedAt
            )
        }

    return SnapshotBlob(repos: repos)
}

private func selectMetadata(
    entryId: UUID,
    metadataResults: [UUID: Result<RepoMetadata, Error>],
    previousMetadataById: [UUID: RepoMetadata],
    previousSnapshot: SnapshotBlob?
) -> RepoMetadata? {
    if case let .success(metadata)? = metadataResults[entryId] {
        return metadata
    }

    guard let previousRepo = previousSnapshot?.repos.first(where: { $0.id == entryId }) else {
        return nil
    }

    guard let previousMetadata = previousMetadataById[entryId] else {
        return nil
    }

    if previousRepo.name == nil && previousRepo.stars == nil && previousRepo.description == nil {
        return nil
    }

    return previousMetadata
}
