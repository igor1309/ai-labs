@testable import NexumBackend
import Foundation
import XCTest

final class EditNoteUseCaseTests: XCTestCase {

    func test_execute_shouldReturnUpdatedSnapshot_onExistingEntry() async throws {
        let id = UUID()
        let repo = RepoEntry(
            id: id,
            repoUrl: "https://github.com/owner/repo",
            note: "old",
            addedAt: Date(timeIntervalSince1970: 1)
        )
        let repoStore = InMemoryRepoStore(entries: [repo])
        let metadataSource = StubMetadataSource(resultsByUrl: [
            "https://github.com/owner/repo": .success(RepoMetadata(name: "repo", stars: 5, description: nil))
        ])
        let sut = EditNoteUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: InMemorySnapshotStore()
        )

        let snapshot = try await sut.execute(id: id, note: "new")

        XCTAssertEqual(snapshot.repos.map(\.note), ["new"])
    }

    func test_execute_shouldAcceptEmptyNote_onExistingEntry() async throws {
        let id = UUID()
        let repo = RepoEntry(
            id: id,
            repoUrl: "https://github.com/owner/repo",
            note: "old",
            addedAt: Date(timeIntervalSince1970: 1)
        )
        let repoStore = InMemoryRepoStore(entries: [repo])
        let metadataSource = StubMetadataSource(resultsByUrl: [
            "https://github.com/owner/repo": .success(RepoMetadata(name: "repo", stars: 5, description: nil))
        ])
        let sut = EditNoteUseCase(
            repoStore: repoStore,
            metadataSource: metadataSource,
            snapshotStore: InMemorySnapshotStore()
        )

        let snapshot = try await sut.execute(id: id, note: "")

        XCTAssertEqual(snapshot.repos.map(\.note), [""])
    }

    func test_execute_shouldThrowNotFound_onMissingEntry() async {
        let sut = EditNoteUseCase(
            repoStore: InMemoryRepoStore(),
            metadataSource: StubMetadataSource(),
            snapshotStore: InMemorySnapshotStore()
        )

        do {
            _ = try await sut.execute(id: UUID(), note: "note")
            XCTFail("Expected not found")
        } catch {
            XCTAssertEqual(error as? EditNoteUseCaseError, .notFound)
        }
    }
}
