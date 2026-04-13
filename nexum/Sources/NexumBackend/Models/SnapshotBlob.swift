import Foundation

public typealias SnapshotResponse = SnapshotBlob

public struct SnapshotBlob: Codable, Equatable, Sendable {

    public let repos: [SnapshotRepoEntry]

    public init(repos: [SnapshotRepoEntry]) {

        self.repos = repos
    }
}

public struct SnapshotRepoEntry: Codable, Equatable, Sendable {

    public let id: UUID
    public let repoUrl: String
    public let name: String?
    public let stars: Int?
    public let description: String?
    public let note: String
    public let addedAt: Date

    public init(
        id: UUID,
        repoUrl: String,
        name: String?,
        stars: Int?,
        description: String?,
        note: String,
        addedAt: Date
    ) {

        self.id = id
        self.repoUrl = repoUrl
        self.name = name
        self.stars = stars
        self.description = description
        self.note = note
        self.addedAt = addedAt
    }
}
