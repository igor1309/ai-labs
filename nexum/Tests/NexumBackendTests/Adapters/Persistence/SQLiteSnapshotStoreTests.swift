@testable import NexumBackend
import Foundation
import SQLite
import XCTest

final class SQLiteSnapshotStoreTests: XCTestCase {

    func test_read_shouldReturnNil_onEmptyStore() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteSnapshotStore(connection: connection)

        let result = try await sut.read()

        XCTAssertNil(result)
    }

    func test_write_shouldPersistSnapshot_onWrite() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteSnapshotStore(connection: connection)
        let snapshot = SnapshotBlob(
            repos: [
                SnapshotRepoEntry(
                    id: UUID(),
                    repoUrl: "https://github.com/owner/repo",
                    name: "repo",
                    stars: 1,
                    description: nil,
                    note: "note",
                    addedAt: Date(timeIntervalSince1970: 1)
                )
            ]
        )

        try await sut.write(snapshot)
        let result = try await sut.read()

        XCTAssertEqual(result, snapshot)
    }

    func test_write_shouldReplaceExistingSnapshot_onSecondWrite() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteSnapshotStore(connection: connection)
        let first = SnapshotBlob(repos: [])
        let second = SnapshotBlob(
            repos: [
                SnapshotRepoEntry(
                    id: UUID(),
                    repoUrl: "https://github.com/owner/repo",
                    name: "repo",
                    stars: 10,
                    description: "desc",
                    note: "note",
                    addedAt: Date(timeIntervalSince1970: 2)
                )
            ]
        )

        try await sut.write(first)
        try await sut.write(second)
        let result = try await sut.read()

        XCTAssertEqual(result, second)
    }
}
