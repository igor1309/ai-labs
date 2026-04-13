@testable import NexumBackend
import Foundation
import XCTest

final class GetReposUseCaseTests: XCTestCase {

    func test_execute_shouldReturnSnapshot_onSnapshotExists() async throws {
        let snapshot = SnapshotBlob(
            repos: [
                SnapshotRepoEntry(
                    id: UUID(),
                    repoUrl: "https://github.com/owner/repo",
                    name: "repo",
                    stars: 10,
                    description: "desc",
                    note: "note",
                    addedAt: Date(timeIntervalSince1970: 1)
                )
            ]
        )
        let sut = GetReposUseCase(snapshotStore: InMemorySnapshotStore(blob: snapshot))

        let result = try await sut.execute()

        XCTAssertEqual(result, snapshot)
    }

    func test_execute_shouldReturnEmptySnapshot_onSnapshotMissing() async throws {
        let sut = GetReposUseCase(snapshotStore: InMemorySnapshotStore(blob: nil))

        let result = try await sut.execute()

        XCTAssertEqual(result.repos, [])
    }
}
