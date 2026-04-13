import Foundation

#if canImport(IMRxObservation)
import IMRxObservation
#endif

public struct AppState: Equatable, Sendable {
    public var repoTable: [RepoEntry]
    public var fetchState: OperationState
    public var postState: OperationState
    public var query: QueryState

    public init(
        repoTable: [RepoEntry],
        fetchState: OperationState,
        postState: OperationState,
        query: QueryState
    ) {
        self.repoTable = repoTable
        self.fetchState = fetchState
        self.postState = postState
        self.query = query
    }

    public static let initial = AppState(
        repoTable: [],
        fetchState: .loading,
        postState: .idle,
        query: QueryState()
    )
}

public enum OperationState: Equatable, Sendable {
    case idle
    case loading
    case success
    case error(AppError)
}

public enum AppError: Equatable, Sendable {
    case unauthorized
    case invalidInput
    case notFound
    case network
    case unexpectedResponse
    case duplicate(existingId: UUID)
    case serverError(String)
}

public struct RepoEntry: Equatable, Sendable {
    public var id: UUID
    public var repoUrl: String
    public var name: String?
    public var stars: Int?
    public var description: String?
    public var note: String
    public var addedAt: Date

    public init(
        id: UUID,
        repoUrl: String,
        name: String?,
        stars: Int?,
        description: String?,
        note: String,
        addedAt: Date
    ) {
        self.id = id
        self.repoUrl = repoUrl
        self.name = name
        self.stars = stars
        self.description = description
        self.note = note
        self.addedAt = addedAt
    }
}

public struct QueryState: Equatable, Sendable {
    public var searchText: String
    public var sortColumn: SortColumn
    public var sortDirection: SortDirection

    public init(
        searchText: String = "",
        sortColumn: SortColumn = .addedAt,
        sortDirection: SortDirection = .descending
    ) {
        self.searchText = searchText
        self.sortColumn = sortColumn
        self.sortDirection = sortDirection
    }
}

public enum SortColumn: Equatable, Sendable {
    case name
    case stars
    case description
    case note
    case addedAt
}

public enum SortDirection: Equatable, Sendable {
    case ascending
    case descending
}

public enum AppAction: Equatable, Sendable {
    case load
    case addRepo(url: String, note: String)
    case editNote(id: UUID, note: String)
    case updateQuery(String)
    case toggleSortColumn(SortColumn)
    case clearError
    case snapshotReceived([RepoEntry])
    case fetchFailed(AppError)
    case postFailed(AppError)
    case duplicateDetected(existingId: UUID)
}

public enum AppEffect: Equatable, Sendable {
    case getRepos
    case addRepo(url: String, note: String)
    case editNote(id: UUID, note: String)
}

public protocol AddRepo: Sendable {
    func addRepo(url: String, note: String) async -> AddRepoResult
}

public enum AddRepoResult: Equatable, Sendable {
    case success([RepoEntry])
    case duplicate(existingId: UUID)
    case failure(AppError)
}

public protocol GetRepos: Sendable {
    func getRepos() async -> GetReposResult
}

public enum GetReposResult: Equatable, Sendable {
    case success([RepoEntry])
    case failure(AppError)
}

public protocol EditNote: Sendable {
    func editNote(id: UUID, note: String) async -> EditNoteResult
}

public enum EditNoteResult: Equatable, Sendable {
    case success([RepoEntry])
    case failure(AppError)
}

public protocol AppEffectHandler: Sendable {
    func handle(_ effect: AppEffect) async -> AppAction
}

public struct DefaultAppEffectHandler: AppEffectHandler {
    private let addRepo: any AddRepo
    private let getRepos: any GetRepos
    private let editNote: any EditNote

    public init(
        addRepo: any AddRepo,
        getRepos: any GetRepos,
        editNote: any EditNote
    ) {
        self.addRepo = addRepo
        self.getRepos = getRepos
        self.editNote = editNote
    }

    public func handle(_ effect: AppEffect) async -> AppAction {

        switch effect {
        case .getRepos:
            return await mapGetRepos()
        case .addRepo(let url, let note):
            return await mapAddRepo(url: url, note: note)
        case .editNote(let id, let note):
            return await mapEditNote(id: id, note: note)
        }
    }

    private func mapGetRepos() async -> AppAction {

        switch await getRepos.getRepos() {
        case .success(let repos):
            return .snapshotReceived(repos)
        case .failure(let error):
            return .fetchFailed(error)
        }
    }

    private func mapAddRepo(url: String, note: String) async -> AppAction {

        switch await addRepo.addRepo(url: url, note: note) {
        case .success(let repos):
            return .snapshotReceived(repos)
        case .duplicate(let existingId):
            return .duplicateDetected(existingId: existingId)
        case .failure(let error):
            return .postFailed(error)
        }
    }

    private func mapEditNote(id: UUID, note: String) async -> AppAction {

        switch await editNote.editNote(id: id, note: note) {
        case .success(let repos):
            return .snapshotReceived(repos)
        case .failure(let error):
            return .postFailed(error)
        }
    }
}

public func handleAppEffect(
    _ effect: AppEffect,
    using handler: any AppEffectHandler
) -> AsyncStream<AppAction> {

    AsyncStream { continuation in
        Task {
            let action = await handler.handle(effect)
            continuation.yield(action)
            continuation.finish()
        }
    }
}

public func reduce(state: AppState, action: AppAction) -> (AppState, AppEffect?) {

    var nextState = state

    switch action {
    case .load:
        nextState.fetchState = .loading
        return (nextState, .getRepos)

    case .addRepo(let url, let note):
        nextState.postState = .loading
        return (nextState, .addRepo(url: url, note: note))

    case .editNote(let id, let note):
        nextState.postState = .loading
        return (nextState, .editNote(id: id, note: note))

    case .updateQuery(let text):
        nextState.query.searchText = text
        return (nextState, nil)

    case .toggleSortColumn(let column):
        if nextState.query.sortColumn == column {
            nextState.query.sortDirection = nextState.query.sortDirection == .ascending ? .descending : .ascending
        } else {
            nextState.query.sortColumn = column
            nextState.query.sortDirection = .ascending
        }
        return (nextState, nil)

    case .clearError:
        if case .error = nextState.fetchState {
            nextState.fetchState = .idle
        }
        if case .error = nextState.postState {
            nextState.postState = .idle
        }
        return (nextState, nil)

    case .snapshotReceived(let repos):
        nextState.repoTable = repos
        if nextState.fetchState == .loading {
            nextState.fetchState = .success
        }
        if nextState.postState == .loading {
            nextState.postState = .success
        }
        return (nextState, nil)

    case .fetchFailed(let error):
        nextState.fetchState = .error(error)
        return (nextState, nil)

    case .postFailed(let error):
        nextState.postState = .error(error)
        return (nextState, nil)

    case .duplicateDetected(let existingId):
        nextState.postState = .error(.duplicate(existingId: existingId))
        return (nextState, nil)
    }
}

public func filteredAndSorted(entries: [RepoEntry], query: QueryState) -> [RepoEntry] {

    let filteredEntries = filter(entries: entries, searchText: query.searchText)
    return sort(entries: filteredEntries, column: query.sortColumn, direction: query.sortDirection)
}

private func filter(entries: [RepoEntry], searchText: String) -> [RepoEntry] {

    let normalizedTerm = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard normalizedTerm.isEmpty == false else {
        return entries
    }

    return entries.filter {
        ($0.name ?? "").lowercased().contains(normalizedTerm)
            || ($0.description ?? "").lowercased().contains(normalizedTerm)
            || $0.note.lowercased().contains(normalizedTerm)
    }
}

private func sort(entries: [RepoEntry], column: SortColumn, direction: SortDirection) -> [RepoEntry] {

    entries.sorted { lhs, rhs in
        let comparison = compare(lhs: lhs, rhs: rhs, column: column)
        switch comparison {
        case .orderedAscending:
            return direction == .ascending
        case .orderedDescending:
            return direction == .descending
        case .orderedSame:
            return lhs.id.uuidString < rhs.id.uuidString
        }
    }
}

private func compare(lhs: RepoEntry, rhs: RepoEntry, column: SortColumn) -> ComparisonResult {

    switch column {
    case .name:
        return compareStrings(lhs.name ?? "", rhs.name ?? "")
    case .description:
        return compareStrings(lhs.description ?? "", rhs.description ?? "")
    case .note:
        return compareStrings(lhs.note, rhs.note)
    case .stars:
        return compareIntegers(lhs.stars ?? 0, rhs.stars ?? 0)
    case .addedAt:
        return compareDates(lhs.addedAt, rhs.addedAt)
    }
}

private func compareStrings(_ lhs: String, _ rhs: String) -> ComparisonResult {

    let result = lhs.localizedCaseInsensitiveCompare(rhs)
    if result == .orderedSame {
        return .orderedSame
    }
    return result
}

private func compareIntegers(_ lhs: Int, _ rhs: Int) -> ComparisonResult {

    if lhs < rhs {
        return .orderedAscending
    }
    if lhs > rhs {
        return .orderedDescending
    }
    return .orderedSame
}

private func compareDates(_ lhs: Date, _ rhs: Date) -> ComparisonResult {

    if lhs < rhs {
        return .orderedAscending
    }
    if lhs > rhs {
        return .orderedDescending
    }
    return .orderedSame
}
