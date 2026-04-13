import Foundation
import SQLite

public final class SQLiteSnapshotStore: SnapshotStore, @unchecked Sendable {

    private let connection: Connection
    private let id = SQLite.Expression<Int64>("id")
    private let payload = SQLite.Expression<String>("payload")
    private let snapshots = SQLite.Table("snapshot")

    public init(connection: Connection) throws {
        self.connection = connection
        try Self.migrate(connection: connection, id: id, payload: payload, snapshots: snapshots)
    }

    public init(databasePath: String) throws {
        let connection = try Connection(databasePath)
        self.connection = connection
        try Self.migrate(connection: connection, id: id, payload: payload, snapshots: snapshots)
    }

    public func read() async throws -> SnapshotBlob? {
        let query = snapshots.filter(id == 1)
        guard let row = try connection.pluck(query) else {
            return nil
        }

        let data = Data(row[payload].utf8)
        let decoder = JSONDecoder()
        return try decoder.decode(SnapshotBlob.self, from: data)
    }

    public func write(_ blob: SnapshotBlob) async throws {
        let encoder = JSONEncoder()
        let encoded = try encoder.encode(blob)
        guard let json = String(data: encoded, encoding: .utf8) else {
            throw NSError(domain: "SQLiteSnapshotStore", code: 1)
        }

        let upsert = snapshots.insert(
            or: .replace,
            id <- 1,
            payload <- json
        )
        try connection.run(upsert)
    }

    private static func migrate(
        connection: Connection,
        id: SQLite.Expression<Int64>,
        payload: SQLite.Expression<String>,
        snapshots: SQLite.Table
    ) throws {
        let create = snapshots.create(ifNotExists: true) { table in
            table.column(id, primaryKey: true)
            table.column(payload)
            table.check(id == 1)
        }
        try connection.run(create)
    }
}
