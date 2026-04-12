---
date: 2026-04-12
model: claude-sonnet-4-6
description: "Spec: App state machine — sync reducer, effect handler, and collaborator protocols for the repo table"
---

# Spec: Nexum App State Machine (v1)

## Goal

Manage the runtime state of the repo table — snapshot data, fetch/post operation statuses, and search/sort parameters — via a pure reducer and an async effect handler that delegates to injected collaborators; defined in `nexum-frontend-adr-v0_2_0.md`.

## Public interface

### State

```swift
struct AppState {
    var repoTable: [RepoEntry]       // last snapshot from any successful response
    var fetchState: OperationState   // tracks GET /repos
    var postState: OperationState    // tracks POST /repos or PATCH /repos/{id}/note
    var query: QueryState
}

enum OperationState: Equatable {
    case idle
    case loading
    case success
    case error(AppError)
}

enum AppError: Equatable {
    case unauthorized
    case invalidInput
    case notFound
    case network
    case unexpectedResponse
    case duplicate(existingId: UUID)
    case serverError(String)
}

struct RepoEntry: Equatable {
    var id: UUID
    var repoUrl: String
    var name: String?
    var stars: Int?
    var description: String?
    var note: String
    var addedAt: Date
}

struct QueryState: Equatable {
    var searchText: String           // default: ""
    var sortColumn: SortColumn       // default: .addedAt
    var sortDirection: SortDirection // default: .descending
}

enum SortColumn: Equatable { case name, stars, description, note, addedAt }
enum SortDirection: Equatable { case ascending, descending }
```

### Actions

```swift
enum AppAction {
    // User-initiated
    case load
    case addRepo(url: String, note: String)
    case editNote(id: UUID, note: String)
    case updateQuery(String)
    case toggleSortColumn(SortColumn)
    case clearError

    // Effect results
    case snapshotReceived([RepoEntry])
    case fetchFailed(AppError)
    case postFailed(AppError)
    case duplicateDetected(existingId: UUID)
}
```

### Effects

```swift
enum AppEffect {
    case getRepos
    case addRepo(url: String, note: String)
    case editNote(id: UUID, note: String)
}
```

### Reducer

```swift
func reduce(state: AppState, action: AppAction) -> (AppState, AppEffect?)
```

### Effect handler

```swift
protocol AppEffectHandler {
    func handle(_ effect: AppEffect) async -> AppAction
}
```

### Collaborator protocols (owned by the effect handler)

```swift
protocol AddRepo {
    func addRepo(url: String, note: String) async -> AddRepoResult
}

enum AddRepoResult {
    case success([RepoEntry])
    case duplicate(existingId: UUID)
    case failure(AppError)
}

protocol GetRepos {
    func getRepos() async -> GetReposResult
}

enum GetReposResult {
    case success([RepoEntry])
    case failure(AppError)
}

protocol EditNote {
    func editNote(id: UUID, note: String) async -> EditNoteResult
}

enum EditNoteResult {
    case success([RepoEntry])
    case failure(AppError)
}
```

### Filtered and sorted view

```swift
func filteredAndSorted(entries: [RepoEntry], query: QueryState) -> [RepoEntry]
```

Pure function; not stored in state.

### Initial state

```swift
AppState(
    repoTable: [],
    fetchState: .loading,
    postState: .idle,
    query: QueryState(searchText: "", sortColumn: .addedAt, sortDirection: .descending)
)
```

The caller dispatches `.load` immediately after construction.

## Behavior rules

### Reducer — user actions

1. `.load` → sets `fetchState: .loading`, emits `.getRepos` effect.
2. `.addRepo(url, note)` → sets `postState: .loading`, emits `.addRepo(url, note)` effect.
3. `.editNote(id, note)` → sets `postState: .loading`, emits `.editNote(id, note)` effect.
4. `.updateQuery(text)` → sets `query.searchText = text`; no effect.
5. `.toggleSortColumn(column)`:
   - If `column != query.sortColumn` → sets `query.sortColumn = column`, `query.sortDirection = .ascending`.
   - If `column == query.sortColumn` → toggles `query.sortDirection` (ascending ↔ descending).
6. `.clearError` → sets `fetchState: .idle` if it was `.error(_)`; sets `postState: .idle` if it was `.error(_)`; no-op if neither is in error.

### Reducer — effect results

7. `.snapshotReceived(repos)`:
   - Replaces `repoTable` with `repos`.
   - If `fetchState == .loading` → sets `fetchState: .success`.
   - If `postState == .loading` → sets `postState: .success`.
   - If both `fetchState` and `postState` are `.loading`, both transition to `.success`.
8. `.fetchFailed(error)` → sets `fetchState: .error(error)`.
9. `.postFailed(error)` → sets `postState: .error(error)`.
10. `.duplicateDetected(existingId)` → sets `postState: .error(.duplicate(existingId))`.

### Effect handler

11. `.getRepos` effect → calls `getRepos.getRepos()`; on `.success(repos)` returns `.snapshotReceived(repos)`; on `.failure(e)` returns `.fetchFailed(e)`.
12. `.addRepo(url, note)` effect → calls `addRepo.addRepo(url, note)`; on `.success(repos)` returns `.snapshotReceived(repos)`; on `.duplicate(id)` returns `.duplicateDetected(existingId: id)`; on `.failure(e)` returns `.postFailed(e)`.
13. `.editNote(id, note)` effect → calls `editNote.editNote(id, note)`; on `.success(repos)` returns `.snapshotReceived(repos)`; on `.failure(e)` returns `.postFailed(e)`.
14. Effect handler does not know about HTTP, auth, or network.

### Filtered and sorted view

15. `searchText` is empty → returns all entries in sort order.
16. `searchText` is non-empty → case-insensitive substring match across `name`, `description`, and `note`; entries where none of the three fields contains the term are excluded.
17. Nil fields (`name`, `description`) are treated as empty strings for matching.
18. Sort is applied after filtering; result order is deterministic for equal values.
19. Sort nil handling: nil `name` and `description` are treated as empty string for comparison; nil `stars` is treated as 0.

## Tests (required)

### Reducer — user actions

1. Initial state: `fetchState: .loading`, `postState: .idle`, `repoTable: []`, `query: (.addedAt, .descending, "")`.
2. `.load` → `fetchState: .loading`, `.getRepos` effect returned.
3. `.addRepo(url, note)` → `postState: .loading`, `.addRepo(url, note)` effect returned.
4. `.editNote(id, note)` → `postState: .loading`, `.editNote(id, note)` effect returned.
5. `.updateQuery("swift")` → `query.searchText: "swift"`, no effect.
6. `.toggleSortColumn(.name)` when active column is `.addedAt` → `sortColumn: .name`, `sortDirection: .ascending`.
7. `.toggleSortColumn(.addedAt)` when active column is `.addedAt` and direction is `.descending` → `sortDirection: .ascending`.
8. `.toggleSortColumn(.addedAt)` when active column is `.addedAt` and direction is `.ascending` → `sortDirection: .descending`.
9. `.clearError` when `fetchState: .error(...)` → `fetchState: .idle`.
10. `.clearError` when `postState: .error(...)` → `postState: .idle`.
11. `.clearError` when neither in error → state unchanged, no effect.

### Reducer — effect results

12. `.snapshotReceived(repos)` while `fetchState: .loading` → `repoTable` replaced with `repos`, `fetchState: .success`.
13. `.snapshotReceived(repos)` while `postState: .loading` → `repoTable` replaced with `repos`, `postState: .success`.
14. `.fetchFailed(error)` → `fetchState: .error(error)`.
15. `.postFailed(error)` → `postState: .error(error)`.
16. `.duplicateDetected(id)` → `postState: .error(.duplicate(id))`.

### Effect handler (with fakes)

17. `.getRepos` → collaborator returns `.success(repos)` → action `.snapshotReceived(repos)`.
18. `.getRepos` → collaborator returns `.failure(e)` → action `.fetchFailed(e)`.
19. `.addRepo(url, note)` → collaborator returns `.success(repos)` → action `.snapshotReceived(repos)`.
20. `.addRepo(url, note)` → collaborator returns `.duplicate(id)` → action `.duplicateDetected(existingId: id)`.
21. `.addRepo(url, note)` → collaborator returns `.failure(e)` → action `.postFailed(e)`.
22. `.editNote(id, note)` → collaborator returns `.success(repos)` → action `.snapshotReceived(repos)`.
23. `.editNote(id, note)` → collaborator returns `.failure(e)` → action `.postFailed(e)`.

### Filtered and sorted view

24. Empty `searchText`, 3 entries → all 3 returned in sort order.
25. `searchText: "swift"` matches `name` case-insensitively → entry included; "Python" entry excluded.
26. `searchText: "swift"` matches `description` when name/note don't match → entry included.
27. `searchText: "swift"` matches `note` when name/description don't match → entry included.
28. Nil `name` and nil `description` — only `note` participates in match.
29. Sort `.addedAt` descending → newest `addedAt` first.
30. Sort `.name` ascending → alphabetical order (nil name treated as "").
31. Sort `.stars` ascending → nil stars sorted as 0 (before positive values).
32. Sort `.description` ascending → nil description sorted as empty string.

## Done criteria

- `AppError` and `RepoEntry` are defined in this module.
- Reducer is a pure function with no side effects; all transitions match the rules above.
- Effect handler conforms to `AppEffectHandler` protocol; collaborators are injected via their own protocols.
- `AddRepo`, `GetRepos`, `EditNote` protocols live in the same module as the effect handler.
- All listed tests pass.
