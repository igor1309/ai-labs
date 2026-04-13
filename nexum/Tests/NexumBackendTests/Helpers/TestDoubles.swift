@testable import NexumBackend
import Foundation

actor InMemoryRepoStore: RepoStore {

    private var entries: [RepoEntry]
    private var idFactory: @Sendable () -> UUID

    init(
        entries: [RepoEntry] = [],
        idFactory: @escaping @Sendable () -> UUID = UUID.init
    ) {

        self.entries = entries
        self.idFactory = idFactory
    }

    func add(url: String, note: String, addedAt: Date) async throws -> Result<RepoEntry, AddRepoError> {
        if let existing = entries.first(where: { $0.repoUrl == url }) {
            return .failure(.duplicate(existingId: existing.id))
        }

        let entry = RepoEntry(
            id: idFactory(),
            repoUrl: url,
            note: note,
            addedAt: addedAt
        )
        entries.append(entry)
        return .success(entry)
    }

    func findById(_ id: UUID) async throws -> RepoEntry? {
        entries.first(where: { $0.id == id })
    }

    func findByUrl(_ url: String) async throws -> RepoEntry? {
        entries.first(where: { $0.repoUrl == url })
    }

    func updateNote(id: UUID, note: String) async throws -> Result<Void, NotFoundError> {
        guard let index = entries.firstIndex(where: { $0.id == id }) else {
            return .failure(.notFound(id: id))
        }

        let current = entries[index]
        entries[index] = RepoEntry(
            id: current.id,
            repoUrl: current.repoUrl,
            note: note,
            addedAt: current.addedAt
        )
        return .success(())
    }

    func list() async throws -> [RepoEntry] {
        entries
    }
}

actor InMemorySnapshotStore: SnapshotStore {

    private(set) var blob: SnapshotBlob?

    init(blob: SnapshotBlob? = nil) {

        self.blob = blob
    }

    func read() async throws -> SnapshotBlob? {
        blob
    }

    func write(_ blob: SnapshotBlob) async throws {
        self.blob = blob
    }
}

actor StubMetadataSource: MetadataSource {

    private var resultsByUrl: [String: Result<RepoMetadata, Error>]

    init(resultsByUrl: [String: Result<RepoMetadata, Error>] = [:]) {

        self.resultsByUrl = resultsByUrl
    }

    func fetch(url: String) async throws -> RepoMetadata {
        guard let result = resultsByUrl[url] else {
            throw TestError.notStubbed
        }

        switch result {
        case let .success(metadata):
            return metadata
        case let .failure(error):
            throw error
        }
    }
}

final class StubCredentialVerifier: CredentialVerifier, @unchecked Sendable {

    private let verifyResult: Bool

    init(verifyResult: Bool) {

        self.verifyResult = verifyResult
    }

    func verify(username: String, password: String) -> Bool {
        _ = username
        _ = password
        return verifyResult
    }
}

final class StubTokenIssuer: TokenIssuer, @unchecked Sendable {

    private let tokenResult: TokenResult

    init(tokenResult: TokenResult) {

        self.tokenResult = tokenResult
    }

    func issue(username: String) -> TokenResult {
        _ = username
        return tokenResult
    }
}

enum TestError: Error {
    case failed
    case notStubbed
}
