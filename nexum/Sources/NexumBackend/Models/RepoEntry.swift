import Foundation

public struct RepoEntry: Codable, Equatable, Sendable {

    public let id: UUID
    public let repoUrl: String
    public let note: String
    public let addedAt: Date

    public init(
        id: UUID,
        repoUrl: String,
        note: String,
        addedAt: Date
    ) {

        self.id = id
        self.repoUrl = repoUrl
        self.note = note
        self.addedAt = addedAt
    }
}
