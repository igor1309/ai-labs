@testable import NexumBackend
import Foundation
import XCTest

final class AddRepoUseCaseTests: XCTestCase {

    func test_execute_shouldReturnSnapshotWithFreshMetadata_onSuccessfulInsertAndMetadataFetch() async throws {
        let addedAt = Date(timeIntervalSince1970: 100)
        let id = UUID()
        let repoStore = InMemoryRepoStore(idFactory: { id })
        let snapshotStore = InMemorySnapshotStore()
        let metadataSource = StubMetadataSource(resultsByUrl: [
            "https://github.com/owner/repo": .success(
                RepoMetadata(name: "repo", stars: 12, description: "description")
            )
        ])
        let sut = AddRepoUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: snapshotStore,
            clock: { addedAt }
        )

        let snapshot = try await sut.execute(url: "https://github.com/owner/repo", note: "note")

        XCTAssertEqual(snapshot.repos.map(\.name), ["repo"])
    }

    func test_execute_shouldReturnSnapshotWithNilMetadata_onMetadataFailureWithoutPreviousSnapshot() async throws {
        let id = UUID()
        let repoStore = InMemoryRepoStore(idFactory: { id })
        let snapshotStore = InMemorySnapshotStore()
        let metadataSource = StubMetadataSource(resultsByUrl: [
            "https://github.com/owner/repo": .failure(TestError.failed)
        ])
        let sut = AddRepoUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: snapshotStore
        )

        let snapshot = try await sut.execute(url: "https://github.com/owner/repo", note: "note")

        XCTAssertEqual(snapshot.repos.map(\.name), [nil])
    }

    func test_execute_shouldPreservePreviousMetadata_onMetadataFailureWithPreviousSnapshot() async throws {
        let id = UUID()
        let repoStore = InMemoryRepoStore(idFactory: { id })
        let previousSnapshot = SnapshotBlob(
            repos: [
                SnapshotRepoEntry(
                    id: id,
                    repoUrl: "https://github.com/owner/repo",
                    name: "previous",
                    stars: 11,
                    description: "old",
                    note: "old-note",
                    addedAt: Date(timeIntervalSince1970: 50)
                )
            ]
        )
        let snapshotStore = InMemorySnapshotStore(blob: previousSnapshot)
        let metadataSource = StubMetadataSource(resultsByUrl: [
            "https://github.com/owner/repo": .failure(TestError.failed)
        ])
        let sut = AddRepoUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: snapshotStore
        )

        let snapshot = try await sut.execute(url: "https://github.com/owner/repo", note: "note")

        XCTAssertEqual(snapshot.repos.map(\.name), ["previous"])
    }

    func test_execute_shouldThrowDuplicateError_onDuplicateRepoUrl() async throws {
        let existing = RepoEntry(
            id: UUID(),
            repoUrl: "https://github.com/owner/repo",
            note: "note",
            addedAt: Date(timeIntervalSince1970: 1)
        )
        let repoStore = InMemoryRepoStore(entries: [existing])
        let snapshotStore = InMemorySnapshotStore()
        let metadataSource = StubMetadataSource()
        let sut = AddRepoUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: snapshotStore
        )

        do {
            _ = try await sut.execute(url: "https://github.com/owner/repo", note: "another")
            XCTFail("Expected duplicate error")
        } catch {
            XCTAssertEqual(error as? AddRepoUseCaseError, .duplicate(existingId: existing.id))
        }
    }

    func test_execute_shouldThrowInvalidInputError_onMalformedUrl() async throws {
        let sut = AddRepoUseCase(
            repoStore: InMemoryRepoStore(),
            metadataSource: StubMetadataSource(),
            snapshotStore: InMemorySnapshotStore()
        )

        do {
            _ = try await sut.execute(url: "invalid", note: "note")
            XCTFail("Expected invalid input error")
        } catch {
            XCTAssertEqual(error as? AddRepoUseCaseError, .invalidInput)
        }
    }

    func test_execute_shouldAssignServerAddedAt_onInsert() async throws {
        let fixedDate = Date(timeIntervalSince1970: 444)
        let repoStore = InMemoryRepoStore()
        let metadataSource = StubMetadataSource(resultsByUrl: [
            "https://github.com/owner/repo": .failure(TestError.failed)
        ])
        let sut = AddRepoUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: InMemorySnapshotStore(),
            clock: { fixedDate }
        )

        _ = try await sut.execute(url: "https://github.com/owner/repo", note: "note")
        let entries = try await repoStore.list()

        XCTAssertEqual(entries.map(\.addedAt), [fixedDate])
    }
}
