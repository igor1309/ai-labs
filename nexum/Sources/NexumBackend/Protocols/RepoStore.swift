import Foundation

public protocol RepoStore: Sendable {

    func add(url: String, note: String, addedAt: Date) async throws -> Result<RepoEntry, AddRepoError>
    func findById(_ id: UUID) async throws -> RepoEntry?
    func findByUrl(_ url: String) async throws -> RepoEntry?
    func updateNote(id: UUID, note: String) async throws -> Result<Void, NotFoundError>
    func list() async throws -> [RepoEntry]
}
