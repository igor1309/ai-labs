@testable import NexumBackend
import Foundation
import XCTest

final class SnapshotBuilderTests: XCTestCase {

    func test_buildSnapshot_shouldOrderEntriesByAddedAt_onMultipleEntries() {
        let later = makeRepoEntry(addedAt: Date(timeIntervalSince1970: 2))
        let earlier = makeRepoEntry(addedAt: Date(timeIntervalSince1970: 1))

        let snapshot = buildSnapshot(
            entries: [later, earlier],
            metadataResults: [:],
            previousSnapshot: nil
        )

        XCTAssertEqual(snapshot.repos.map(\.id), [earlier.id, later.id])
    }

    func test_buildSnapshot_shouldUseFreshMetadata_onSuccessfulMetadataFetch() {
        let entry = makeRepoEntry()
        let metadata = RepoMetadata(name: "repo", stars: 42, description: "desc")

        let snapshot = buildSnapshot(
            entries: [entry],
            metadataResults: [entry.id: .success(metadata)],
            previousSnapshot: nil
        )

        XCTAssertEqual(snapshot.repos.map(\.name), ["repo"])
    }

    func test_buildSnapshot_shouldPreservePreviousMetadata_onMetadataFailureWithPreviousValue() {
        let entry = makeRepoEntry()
        let previous = SnapshotBlob(
            repos: [
                SnapshotRepoEntry(
                    id: entry.id,
                    repoUrl: entry.repoUrl,
                    name: "previous",
                    stars: 7,
                    description: "old",
                    note: entry.note,
                    addedAt: entry.addedAt
                )
            ]
        )

        let snapshot = buildSnapshot(
            entries: [entry],
            metadataResults: [entry.id: .failure(makeSomeError())],
            previousSnapshot: previous
        )

        XCTAssertEqual(snapshot.repos.map(\.name), ["previous"])
    }

    func test_buildSnapshot_shouldUseNilMetadata_onMetadataFailureWithoutPreviousValue() {
        let entry = makeRepoEntry()

        let snapshot = buildSnapshot(
            entries: [entry],
            metadataResults: [entry.id: .failure(makeSomeError())],
            previousSnapshot: nil
        )

        XCTAssertEqual(snapshot.repos.map(\.name), [nil])
    }

    func test_buildSnapshot_shouldReturnEmptyRepos_onEmptyEntries() {
        let snapshot = buildSnapshot(
            entries: [],
            metadataResults: [:],
            previousSnapshot: nil
        )

        XCTAssertEqual(snapshot.repos, [])
    }

    func test_buildSnapshot_shouldIncludeEachEntryOnce_onDistinctEntries() {
        let first = makeRepoEntry()
        let second = makeRepoEntry()

        let snapshot = buildSnapshot(
            entries: [first, second],
            metadataResults: [:],
            previousSnapshot: nil
        )

        XCTAssertEqual(Set(snapshot.repos.map(\.id)), Set([first.id, second.id]))
    }

    // MARK: - Helpers

    private func makeRepoEntry(
        id: UUID = UUID(),
        repoUrl: String = "https://github.com/owner/repo",
        note: String = "note",
        addedAt: Date = Date(timeIntervalSince1970: 100)
    ) -> RepoEntry {

        RepoEntry(
            id: id,
            repoUrl: repoUrl,
            note: note,
            addedAt: addedAt
        )
    }

    private func makeSomeError() -> Error {
        NSError(domain: "test", code: 1)
    }
}
