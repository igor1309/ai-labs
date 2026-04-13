import Foundation
@testable import NexumCore
import XCTest

final class AppReducerTests: XCTestCase {

    func test_initialState_shouldMatchSpecDefaults_onConstruction() {
        XCTAssertEqual(AppState.initial, AppState(
            repoTable: [],
            fetchState: .loading,
            postState: .idle,
            query: QueryState(searchText: "", sortColumn: .addedAt, sortDirection: .descending)
        ))
    }

    func test_reduce_shouldSetFetchLoadingAndEmitGetRepos_onLoadAction() {
        XCTAssertEqual(makeOutcome(state: makeState(fetchState: .idle), action: .load), ReduceOutcome(
            state: makeState(fetchState: .loading),
            effect: .getRepos
        ))
    }

    func test_reduce_shouldSetPostLoadingAndEmitAddRepo_onAddRepoAction() {
        XCTAssertEqual(makeOutcome(state: makeState(), action: .addRepo(url: "https://example.com/a", note: "note")), ReduceOutcome(
            state: makeState(postState: .loading),
            effect: .addRepo(url: "https://example.com/a", note: "note")
        ))
    }

    func test_reduce_shouldSetPostLoadingAndEmitEditNote_onEditNoteAction() {
        let id = UUID()
        XCTAssertEqual(makeOutcome(state: makeState(), action: .editNote(id: id, note: "updated")), ReduceOutcome(
            state: makeState(postState: .loading),
            effect: .editNote(id: id, note: "updated")
        ))
    }

    func test_reduce_shouldUpdateSearchText_onUpdateQueryAction() {
        XCTAssertEqual(makeOutcome(state: makeState(), action: .updateQuery("swift")), ReduceOutcome(
            state: makeState(query: QueryState(searchText: "swift", sortColumn: .addedAt, sortDirection: .descending)),
            effect: nil
        ))
    }

    func test_reduce_shouldSetAscendingDirection_onToggleSortForNewColumn() {
        XCTAssertEqual(makeOutcome(state: makeState(query: QueryState(sortColumn: .addedAt, sortDirection: .descending)), action: .toggleSortColumn(.name)), ReduceOutcome(
            state: makeState(query: QueryState(searchText: "", sortColumn: .name, sortDirection: .ascending)),
            effect: nil
        ))
    }

    func test_reduce_shouldToggleToAscending_onToggleSortForSameColumnWhenDescending() {
        XCTAssertEqual(makeOutcome(state: makeState(query: QueryState(sortColumn: .addedAt, sortDirection: .descending)), action: .toggleSortColumn(.addedAt)), ReduceOutcome(
            state: makeState(query: QueryState(searchText: "", sortColumn: .addedAt, sortDirection: .ascending)),
            effect: nil
        ))
    }

    func test_reduce_shouldToggleToDescending_onToggleSortForSameColumnWhenAscending() {
        XCTAssertEqual(makeOutcome(state: makeState(query: QueryState(sortColumn: .addedAt, sortDirection: .ascending)), action: .toggleSortColumn(.addedAt)), ReduceOutcome(
            state: makeState(query: QueryState(searchText: "", sortColumn: .addedAt, sortDirection: .descending)),
            effect: nil
        ))
    }

    func test_reduce_shouldResetFetchErrorToIdle_onClearErrorActionWithFetchError() {
        XCTAssertEqual(makeOutcome(state: makeState(fetchState: .error(.network)), action: .clearError), ReduceOutcome(
            state: makeState(fetchState: .idle),
            effect: nil
        ))
    }

    func test_reduce_shouldResetPostErrorToIdle_onClearErrorActionWithPostError() {
        XCTAssertEqual(makeOutcome(state: makeState(postState: .error(.network)), action: .clearError), ReduceOutcome(
            state: makeState(postState: .idle),
            effect: nil
        ))
    }

    func test_reduce_shouldKeepStateUnchanged_onClearErrorActionWithoutErrors() {
        XCTAssertEqual(makeOutcome(state: makeState(fetchState: .success, postState: .idle), action: .clearError), ReduceOutcome(
            state: makeState(fetchState: .success, postState: .idle),
            effect: nil
        ))
    }

    func test_reduce_shouldReplaceTableAndSetFetchSuccess_onSnapshotReceivedWhenFetchLoading() {
        let repos = [makeRepoEntry(), makeRepoEntry()]
        XCTAssertEqual(makeOutcome(state: makeState(fetchState: .loading), action: .snapshotReceived(repos)), ReduceOutcome(
            state: makeState(repoTable: repos, fetchState: .success),
            effect: nil
        ))
    }

    func test_reduce_shouldReplaceTableAndSetPostSuccess_onSnapshotReceivedWhenPostLoading() {
        let repos = [makeRepoEntry(), makeRepoEntry()]
        XCTAssertEqual(makeOutcome(state: makeState(postState: .loading), action: .snapshotReceived(repos)), ReduceOutcome(
            state: makeState(repoTable: repos, postState: .success),
            effect: nil
        ))
    }

    func test_reduce_shouldSetFetchError_onFetchFailedAction() {
        XCTAssertEqual(makeOutcome(state: makeState(), action: .fetchFailed(.network)), ReduceOutcome(
            state: makeState(fetchState: .error(.network)),
            effect: nil
        ))
    }

    func test_reduce_shouldSetPostError_onPostFailedAction() {
        XCTAssertEqual(makeOutcome(state: makeState(), action: .postFailed(.invalidInput)), ReduceOutcome(
            state: makeState(postState: .error(.invalidInput)),
            effect: nil
        ))
    }

    func test_reduce_shouldSetDuplicateError_onDuplicateDetectedAction() {
        let existingId = UUID()
        XCTAssertEqual(makeOutcome(state: makeState(), action: .duplicateDetected(existingId: existingId)), ReduceOutcome(
            state: makeState(postState: .error(.duplicate(existingId: existingId))),
            effect: nil
        ))
    }

    // MARK: - Helpers

    private struct ReduceOutcome: Equatable {
        let state: AppState
        let effect: AppEffect?
    }

    private func makeOutcome(state: AppState, action: AppAction) -> ReduceOutcome {

        let reduced = reduce(state: state, action: action)
        return ReduceOutcome(state: reduced.0, effect: reduced.1)
    }

    private func makeState(
        repoTable: [RepoEntry] = [],
        fetchState: OperationState = .idle,
        postState: OperationState = .idle,
        query: QueryState = QueryState()
    ) -> AppState {

        AppState(
            repoTable: repoTable,
            fetchState: fetchState,
            postState: postState,
            query: query
        )
    }

    private func makeRepoEntry(
        id: UUID = UUID(),
        repoUrl: String = "https://example.com/default",
        name: String? = nil,
        stars: Int? = nil,
        description: String? = nil,
        note: String = "note",
        addedAt: Date = Date(timeIntervalSince1970: 0)
    ) -> RepoEntry {

        RepoEntry(
            id: id,
            repoUrl: repoUrl,
            name: name,
            stars: stars,
            description: description,
            note: note,
            addedAt: addedAt
        )
    }
}

final class AppEffectHandlerTests: XCTestCase {

    func test_handle_shouldReturnSnapshotReceived_onGetReposSuccess() async {
        let repos = [makeRepoEntry()]
        let sut = makeSUT(getReposResult: .success(repos))

        let action = await sut.handle(.getRepos)

        XCTAssertEqual(action, .snapshotReceived(repos))
    }

    func test_handle_shouldReturnFetchFailed_onGetReposFailure() async {
        let sut = makeSUT(getReposResult: .failure(.network))

        let action = await sut.handle(.getRepos)

        XCTAssertEqual(action, .fetchFailed(.network))
    }

    func test_handle_shouldReturnSnapshotReceived_onAddRepoSuccess() async {
        let repos = [makeRepoEntry()]
        let sut = makeSUT(addRepoResult: .success(repos))

        let action = await sut.handle(.addRepo(url: "https://example.com/a", note: "note"))

        XCTAssertEqual(action, .snapshotReceived(repos))
    }

    func test_handle_shouldReturnDuplicateDetected_onAddRepoDuplicate() async {
        let existingId = UUID()
        let sut = makeSUT(addRepoResult: .duplicate(existingId: existingId))

        let action = await sut.handle(.addRepo(url: "https://example.com/a", note: "note"))

        XCTAssertEqual(action, .duplicateDetected(existingId: existingId))
    }

    func test_handle_shouldReturnPostFailed_onAddRepoFailure() async {
        let sut = makeSUT(addRepoResult: .failure(.invalidInput))

        let action = await sut.handle(.addRepo(url: "https://example.com/a", note: "note"))

        XCTAssertEqual(action, .postFailed(.invalidInput))
    }

    func test_handle_shouldReturnSnapshotReceived_onEditNoteSuccess() async {
        let repos = [makeRepoEntry()]
        let sut = makeSUT(editNoteResult: .success(repos))

        let action = await sut.handle(.editNote(id: UUID(), note: "updated"))

        XCTAssertEqual(action, .snapshotReceived(repos))
    }

    func test_handle_shouldReturnPostFailed_onEditNoteFailure() async {
        let sut = makeSUT(editNoteResult: .failure(.notFound))

        let action = await sut.handle(.editNote(id: UUID(), note: "updated"))

        XCTAssertEqual(action, .postFailed(.notFound))
    }

    // MARK: - Helpers

    private func makeSUT(
        addRepoResult: AddRepoResult = .success([]),
        getReposResult: GetReposResult = .success([]),
        editNoteResult: EditNoteResult = .success([])
    ) -> DefaultAppEffectHandler {

        DefaultAppEffectHandler(
            addRepo: AddRepoStub(result: addRepoResult),
            getRepos: GetReposStub(result: getReposResult),
            editNote: EditNoteStub(result: editNoteResult)
        )
    }

    private func makeRepoEntry(
        id: UUID = UUID(),
        repoUrl: String = "https://example.com/default",
        name: String? = nil,
        stars: Int? = nil,
        description: String? = nil,
        note: String = "note",
        addedAt: Date = Date(timeIntervalSince1970: 0)
    ) -> RepoEntry {

        RepoEntry(
            id: id,
            repoUrl: repoUrl,
            name: name,
            stars: stars,
            description: description,
            note: note,
            addedAt: addedAt
        )
    }

    private actor AddRepoStub: AddRepo {
        private let result: AddRepoResult

        init(result: AddRepoResult) {
            self.result = result
        }

        func addRepo(url: String, note: String) async -> AddRepoResult {
            result
        }
    }

    private actor GetReposStub: GetRepos {
        private let result: GetReposResult

        init(result: GetReposResult) {
            self.result = result
        }

        func getRepos() async -> GetReposResult {
            result
        }
    }

    private actor EditNoteStub: EditNote {
        private let result: EditNoteResult

        init(result: EditNoteResult) {
            self.result = result
        }

        func editNote(id: UUID, note: String) async -> EditNoteResult {
            result
        }
    }
}

final class AppFilteredAndSortedTests: XCTestCase {

    func test_filteredAndSorted_shouldReturnAllEntriesInSortOrder_onEmptySearchText() {
        let oldId = UUID()
        let middleId = UUID()
        let newId = UUID()
        let entries = [
            makeRepoEntry(id: oldId, name: "A", note: "old", addedAt: Date(timeIntervalSince1970: 100)),
            makeRepoEntry(id: middleId, name: "B", note: "middle", addedAt: Date(timeIntervalSince1970: 200)),
            makeRepoEntry(id: newId, name: "C", note: "new", addedAt: Date(timeIntervalSince1970: 300)),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "", sortColumn: .addedAt, sortDirection: .descending))

        XCTAssertEqual(result.map(\.id), [newId, middleId, oldId])
    }

    func test_filteredAndSorted_shouldIncludeMatchingNameCaseInsensitively_onNonEmptySearchText() {
        let matchingId = UUID()
        let excludedId = UUID()
        let entries = [
            makeRepoEntry(id: matchingId, name: "SwiftNIO", description: "Networking", note: "First"),
            makeRepoEntry(id: excludedId, name: "Python Tooling", description: "Scripting", note: "Second"),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "swift", sortColumn: .addedAt, sortDirection: .descending))

        XCTAssertEqual(result.map(\.id), [matchingId])
    }

    func test_filteredAndSorted_shouldIncludeEntryWhenDescriptionMatches_onSearchText() {
        let matchingId = UUID()
        let entries = [
            makeRepoEntry(id: matchingId, name: "Toolkit", description: "Swift package utilities", note: "note"),
            makeRepoEntry(id: UUID(), name: "Toolkit", description: "Other ecosystem", note: "note"),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "swift", sortColumn: .addedAt, sortDirection: .descending))

        XCTAssertEqual(result.map(\.id), [matchingId])
    }

    func test_filteredAndSorted_shouldIncludeEntryWhenNoteMatches_onSearchText() {
        let matchingId = UUID()
        let entries = [
            makeRepoEntry(id: matchingId, name: "Toolkit", description: "Other ecosystem", note: "Use for swift demos"),
            makeRepoEntry(id: UUID(), name: "Toolkit", description: "Other ecosystem", note: "General note"),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "swift", sortColumn: .addedAt, sortDirection: .descending))

        XCTAssertEqual(result.map(\.id), [matchingId])
    }

    func test_filteredAndSorted_shouldTreatNilNameAndDescriptionAsEmpty_onSearchMatching() {
        let matchingId = UUID()
        let entries = [
            makeRepoEntry(id: matchingId, name: nil, description: nil, note: "swift keyword"),
            makeRepoEntry(id: UUID(), name: nil, description: nil, note: "ruby keyword"),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "swift", sortColumn: .addedAt, sortDirection: .descending))

        XCTAssertEqual(result.map(\.id), [matchingId])
    }

    func test_filteredAndSorted_shouldSortByAddedAtDescending_onAddedAtDescendingQuery() {
        let oldestId = UUID()
        let newestId = UUID()
        let entries = [
            makeRepoEntry(id: oldestId, addedAt: Date(timeIntervalSince1970: 10)),
            makeRepoEntry(id: newestId, addedAt: Date(timeIntervalSince1970: 100)),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "", sortColumn: .addedAt, sortDirection: .descending))

        XCTAssertEqual(result.map(\.id), [newestId, oldestId])
    }

    func test_filteredAndSorted_shouldTreatNilNameAsEmpty_onNameAscendingSort() {
        let nilNameId = UUID()
        let alphaId = UUID()
        let entries = [
            makeRepoEntry(id: alphaId, name: "Alpha"),
            makeRepoEntry(id: nilNameId, name: nil),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "", sortColumn: .name, sortDirection: .ascending))

        XCTAssertEqual(result.map(\.id), [nilNameId, alphaId])
    }

    func test_filteredAndSorted_shouldTreatNilStarsAsZero_onStarsAscendingSort() {
        let nilStarsId = UUID()
        let positiveStarsId = UUID()
        let entries = [
            makeRepoEntry(id: positiveStarsId, stars: 42),
            makeRepoEntry(id: nilStarsId, stars: nil),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "", sortColumn: .stars, sortDirection: .ascending))

        XCTAssertEqual(result.map(\.id), [nilStarsId, positiveStarsId])
    }

    func test_filteredAndSorted_shouldTreatNilDescriptionAsEmpty_onDescriptionAscendingSort() {
        let nilDescriptionId = UUID()
        let betaId = UUID()
        let entries = [
            makeRepoEntry(id: betaId, description: "Beta description"),
            makeRepoEntry(id: nilDescriptionId, description: nil),
        ]

        let result = filteredAndSorted(entries: entries, query: QueryState(searchText: "", sortColumn: .description, sortDirection: .ascending))

        XCTAssertEqual(result.map(\.id), [nilDescriptionId, betaId])
    }

    // MARK: - Helpers

    private func makeRepoEntry(
        id: UUID = UUID(),
        repoUrl: String = "https://example.com/default",
        name: String? = nil,
        stars: Int? = nil,
        description: String? = nil,
        note: String = "note",
        addedAt: Date = Date(timeIntervalSince1970: 0)
    ) -> RepoEntry {

        RepoEntry(
            id: id,
            repoUrl: repoUrl,
            name: name,
            stars: stars,
            description: description,
            note: note,
            addedAt: addedAt
        )
    }
}
