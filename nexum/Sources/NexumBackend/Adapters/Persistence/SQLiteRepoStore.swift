import Foundation
import SQLite
import SQLite3

public final class SQLiteRepoStore: RepoStore, @unchecked Sendable {

    private let addedAt = SQLite.Expression<Double>("added_at")
    private let connection: Connection
    private let id = SQLite.Expression<String>("id")
    private let note = SQLite.Expression<String>("note")
    private let repoUrl = SQLite.Expression<String>("repo_url")
    private let repos = SQLite.Table("repos")

    public init(connection: Connection) throws {
        self.connection = connection
        try Self.migrate(
            connection: connection,
            addedAt: addedAt,
            id: id,
            note: note,
            repoUrl: repoUrl,
            repos: repos
        )
    }

    public init(databasePath: String) throws {
        let connection = try Connection(databasePath)
        self.connection = connection
        try Self.migrate(
            connection: connection,
            addedAt: addedAt,
            id: id,
            note: note,
            repoUrl: repoUrl,
            repos: repos
        )
    }

    public func add(url: String, note: String, addedAt: Date) async throws -> Swift.Result<RepoEntry, AddRepoError> {
        let newEntry = RepoEntry(
            id: UUID(),
            repoUrl: url,
            note: note,
            addedAt: addedAt
        )

        do {
            let insert = repos.insert(
                id <- newEntry.id.uuidString,
                repoUrl <- newEntry.repoUrl,
                self.note <- newEntry.note,
                self.addedAt <- newEntry.addedAt.timeIntervalSince1970
            )
            try connection.run(insert)
            return .success(newEntry)
        } catch let sqliteError as SQLite.Result {
            if isUniqueConstraintError(sqliteError),
               let existing = try await findByUrl(url)
            {
                return .failure(.duplicate(existingId: existing.id))
            }
            throw sqliteError
        }
    }

    public func findById(_ id: UUID) async throws -> RepoEntry? {
        let query = repos.filter(self.id == id.uuidString)
        guard let row = try connection.pluck(query) else {
            return nil
        }

        return makeRepoEntry(from: row)
    }

    public func findByUrl(_ url: String) async throws -> RepoEntry? {
        let query = repos.filter(repoUrl == url)
        guard let row = try connection.pluck(query) else {
            return nil
        }

        return makeRepoEntry(from: row)
    }

    public func list() async throws -> [RepoEntry] {
        var result = [RepoEntry]()
        for row in try connection.prepare(repos.order(addedAt.asc)) {
            result.append(makeRepoEntry(from: row))
        }
        return result
    }

    public func updateNote(id: UUID, note: String) async throws -> Swift.Result<Void, NotFoundError> {
        let query = repos.filter(self.id == id.uuidString)
        let updatedRows = try connection.run(query.update(self.note <- note))

        guard updatedRows > 0 else {
            return .failure(.notFound(id: id))
        }

        return .success(())
    }

    private static func migrate(
        connection: Connection,
        addedAt: SQLite.Expression<Double>,
        id: SQLite.Expression<String>,
        note: SQLite.Expression<String>,
        repoUrl: SQLite.Expression<String>,
        repos: SQLite.Table
    ) throws {
        let create = repos.create(ifNotExists: true) { table in
            table.column(id, primaryKey: true)
            table.column(repoUrl, unique: true)
            table.column(note)
            table.column(addedAt)
        }
        try connection.run(create)
    }

    private func makeRepoEntry(from row: Row) -> RepoEntry {
        RepoEntry(
            id: UUID(uuidString: row[id]) ?? UUID(),
            repoUrl: row[repoUrl],
            note: row[note],
            addedAt: Date(timeIntervalSince1970: row[addedAt])
        )
    }

    private func isUniqueConstraintError(_ error: SQLite.Result) -> Bool {
        switch error {
        case let .error(_, code, _):
            return code == SQLITE_CONSTRAINT
        case let .extendedError(_, extendedCode, _):
            return extendedCode == SQLITE_CONSTRAINT
        }
    }
}
