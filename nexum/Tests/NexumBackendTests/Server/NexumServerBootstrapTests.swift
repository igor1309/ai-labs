import Foundation
@testable import NexumBackend
@testable import NexumServer
import SQLite
import XCTest

final class NexumServerBootstrapTests: XCTestCase {

    func test_makeApplication_shouldPreserveDataAcrossRepeatedInitialization_onSameDatabasePath() async throws {
        let databasePath = makeTemporaryDatabasePath()
        let connection = try Connection(databasePath)
        let repoStore = try SQLiteRepoStore(connection: connection)
        let snapshotStore = try SQLiteSnapshotStore(connection: connection)

        let addResult = try await repoStore.add(
            url: "https://github.com/owner/repo",
            note: "note",
            addedAt: Date(timeIntervalSince1970: 100)
        )

        var snapshotEntryId = UUID()
        if case let .success(entry) = addResult {
            snapshotEntryId = entry.id
        }

        let snapshot = SnapshotBlob(
            repos: [
                SnapshotRepoEntry(
                    id: snapshotEntryId,
                    repoUrl: "https://github.com/owner/repo",
                    name: "repo",
                    stars: 1,
                    description: nil,
                    note: "note",
                    addedAt: Date(timeIntervalSince1970: 100)
                )
            ]
        )
        try await snapshotStore.write(snapshot)

        let configuration = NexumServerConfiguration(
            authPasswordHash: "$2b$04$Ptaea0eZ9QjkecBwEPf1IuSlS7xvFeoJEB6Digw1VE3DybZ0SqnX.",
            authUsername: "user",
            databasePath: databasePath,
            githubToken: nil,
            jwtSecret: "secret",
            port: 8080
        )

        _ = try NexumServerBootstrap.makeApplication(configuration: configuration)
        _ = try NexumServerBootstrap.makeApplication(configuration: configuration)

        let connectionAfterRestart = try Connection(databasePath)
        let repoStoreAfterRestart = try SQLiteRepoStore(connection: connectionAfterRestart)
        let snapshotStoreAfterRestart = try SQLiteSnapshotStore(connection: connectionAfterRestart)
        let reposAfterRestart = try await repoStoreAfterRestart.list()
        let snapshotAfterRestart = try await snapshotStoreAfterRestart.read()

        XCTAssertEqual(reposAfterRestart.count, 1)
        XCTAssertEqual(snapshotAfterRestart, snapshot)
    }

    private func makeTemporaryDatabasePath() -> String {
        let fileName = "nexum-\(UUID().uuidString).sqlite"
        return URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent(fileName)
            .path
    }
}
