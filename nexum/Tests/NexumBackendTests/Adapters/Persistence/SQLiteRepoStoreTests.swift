@testable import NexumBackend
import Foundation
import SQLite
import XCTest

final class SQLiteRepoStoreTests: XCTestCase {

    func test_add_shouldPersistEntry_onNewUrl() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteRepoStore(connection: connection)

        _ = try await sut.add(
            url: "https://github.com/owner/repo",
            note: "note",
            addedAt: Date(timeIntervalSince1970: 100)
        )
        let list = try await sut.list()

        XCTAssertEqual(list.map(\.repoUrl), ["https://github.com/owner/repo"])
    }

    func test_add_shouldReturnDuplicate_onDuplicateUrl() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteRepoStore(connection: connection)

        _ = try await sut.add(
            url: "https://github.com/owner/repo",
            note: "first",
            addedAt: Date(timeIntervalSince1970: 100)
        )
        let duplicateResult = try await sut.add(
            url: "https://github.com/owner/repo",
            note: "second",
            addedAt: Date(timeIntervalSince1970: 200)
        )

        if case .failure = duplicateResult {
            XCTAssertTrue(true)
        } else {
            XCTFail("Expected duplicate failure")
        }
    }

    func test_findById_shouldReturnEntry_onExistingId() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteRepoStore(connection: connection)

        let addResult = try await sut.add(
            url: "https://github.com/owner/repo",
            note: "note",
            addedAt: Date(timeIntervalSince1970: 100)
        )

        let id: UUID
        switch addResult {
        case let .success(entry):
            id = entry.id
        case .failure:
            XCTFail("Unexpected duplicate")
            return
        }

        let found = try await sut.findById(id)

        XCTAssertEqual(found?.id, id)
    }

    func test_findByUrl_shouldReturnEntry_onExistingUrl() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteRepoStore(connection: connection)

        _ = try await sut.add(
            url: "https://github.com/owner/repo",
            note: "note",
            addedAt: Date(timeIntervalSince1970: 100)
        )
        let found = try await sut.findByUrl("https://github.com/owner/repo")

        XCTAssertEqual(found?.repoUrl, "https://github.com/owner/repo")
    }

    func test_updateNote_shouldUpdateEntry_onExistingId() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteRepoStore(connection: connection)

        let addResult = try await sut.add(
            url: "https://github.com/owner/repo",
            note: "old",
            addedAt: Date(timeIntervalSince1970: 100)
        )

        let id: UUID
        switch addResult {
        case let .success(entry):
            id = entry.id
        case .failure:
            XCTFail("Unexpected duplicate")
            return
        }

        _ = try await sut.updateNote(id: id, note: "new")
        let updated = try await sut.findById(id)

        XCTAssertEqual(updated?.note, "new")
    }

    func test_updateNote_shouldReturnNotFound_onMissingId() async throws {
        let connection = try Connection(.inMemory)
        let sut = try SQLiteRepoStore(connection: connection)

        let result = try await sut.updateNote(id: UUID(), note: "note")

        if case .failure = result {
            XCTAssertTrue(true)
        } else {
            XCTFail("Expected not found")
        }
    }
}
