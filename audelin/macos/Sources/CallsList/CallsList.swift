/// Owns the calls list's selection, inline rename editing, summary retries, opening a call's folder,
/// and the search query with the tags chosen to filter by.
public struct CallsListMachineState: Equatable, Sendable {
    public struct Row: Equatable, Sendable {
        public var id: String
        public var title: String
        public var editable: Bool
        /// The call's failed summary can be made again.
        public var canRetry: Bool
        public var tags: [String]

        public init(id: String, title: String, editable: Bool, canRetry: Bool = false, tags: [String] = []) {
            self.id = id; self.title = title; self.editable = editable; self.canRetry = canRetry; self.tags = tags
        }
    }

    public struct Editing: Equatable, Sendable {
        public var id: String
        public var title: String

        public init(id: String, title: String) {
            self.id = id; self.title = title
        }
    }

    /// What the list asks of others: Recordings renames and clears its failure, SummaryJobs retries,
    /// and the app opens a call's folder.
    public enum Request: Equatable, Sendable {
        case rename(id: String, title: String)
        case clearFailure
        case retrySummary(String)
        case openFolder(String)
    }

    /// Why the list's own last action failed.
    public enum Failure: Equatable, Sendable {
        case retryFailed
        /// The call's folder was found but did not open.
        case openFailed(id: String)
        /// The call's folder could not be found, for the given reason.
        case locationFailed(id: String, reason: String)
    }

    /// How opening a call's folder ended.
    public enum OpenOutcome: Equatable, Sendable {
        case opened
        case notOpened
        case locationFailed(reason: String)
    }

    public var rows: [Row]
    public var busy: Bool
    /// The selected call; a search can hide it from `rows` and show it again.
    public var selectedID: String?
    public var editing: Editing?
    /// Calls whose summary retry is running; they cannot be retried again until it answers.
    public var retrying: Set<String>
    public var failure: Failure?
    /// A call's folder is being opened; the list takes no other action until it answers.
    public var opening: Bool
    /// The requests the latest asking event made, in order.
    public var requests: [Request]
    /// How many events have made requests; new requests are sent when it grows.
    public var asked: Int
    /// The search field's text, as typed.
    public var query: String
    /// The tags chosen in the filter strip, in the order chosen.
    public var chosenTags: [String]
    /// The tags a call must all have to be listed: the chosen ones and the query's `#tag` words.
    public var filterTags: [String]
    /// The query without its `#tag` words, searched for in titles, tags, transcripts and notes.
    public var searchText: String

    public init(rows: [Row] = [], busy: Bool = false, selectedID: String? = nil, editing: Editing? = nil,
                retrying: Set<String> = [], failure: Failure? = nil, opening: Bool = false,
                requests: [Request] = [], asked: Int = 0, query: String = "", chosenTags: [String] = [],
                filterTags: [String] = [], searchText: String = "") {
        self.rows = rows; self.busy = busy; self.selectedID = selectedID; self.editing = editing
        self.retrying = retrying; self.failure = failure; self.opening = opening; self.requests = requests; self.asked = asked
        self.query = query; self.chosenTags = chosenTags; self.filterTags = filterTags; self.searchText = searchText
    }
}

public enum CallsListMachineEvent: Equatable, Sendable {
    case rowsChanged([CallsListMachineState.Row], busy: Bool)
    case recordingChanged(id: String?)
    case beginRename(String)
    case editTitle(String)
    case cancelRename, submitRename
    case askDelete(String)
    case confirmDelete
    case select(String)
    case selectNext, selectPrevious
    case retry(String)
    case retryFinished(String, succeeded: Bool)
    /// The window was shown again.
    case shown
    case open(String)
    case openFinished(String, CallsListMachineState.OpenOutcome)
    case search(String)
    /// A chip of the filter strip was clicked: its tag is chosen, or no longer.
    case toggleTag(String)
}

public struct CallsListReducer: Sendable {
    private let splitQuery: @Sendable (String) -> (tags: [String], text: String)
    private let tagKey: @Sendable (String) -> String

    /// `splitQuery` takes a query's `#tag` words out of its text; `tagKey` is the form two tags
    /// are compared in.
    public init(splitQuery: @escaping @Sendable (String) -> (tags: [String], text: String),
                tagKey: @escaping @Sendable (String) -> String) {
        self.splitQuery = splitQuery; self.tagKey = tagKey
    }

    public func reduce(_ state: CallsListMachineState, _ event: CallsListMachineEvent) -> CallsListMachineState {
        var state = state
        switch event {
        case let .rowsChanged(rows, busy):
            state.rows = rows
            state.busy = busy
        case let .recordingChanged(id):
            if state.editing?.id == id { state.editing = nil }
        case let .beginRename(id):
            guard !state.busy, let row = state.rows.first(where: { $0.id == id }), row.editable else { return state }
            state.editing = .init(id: id, title: row.title)
            state.failure = nil
            ask([.clearFailure], &state)
        case let .editTitle(title): state.editing?.title = title
        case .cancelRename: state.editing = nil
        case .askDelete:
            state.editing = nil
            state.failure = nil
        case .confirmDelete: state.failure = nil
        case .shown:
            state.editing = nil
            state.failure = nil
            state.query = ""
            state.chosenTags = []
            state.filterTags = []
            state.searchText = ""
        case let .search(query):
            state.query = query
            filter(&state)
        case let .toggleTag(tag):
            let key = tagKey(tag)
            if let index = state.chosenTags.firstIndex(where: { tagKey($0) == key }) {
                state.chosenTags.remove(at: index)
            } else {
                state.chosenTags.append(tag)
            }
            filter(&state)
        case .submitRename: commitRename(&state)
        case let .select(id):
            if state.editing?.id != id { commitRename(&state) }
            state.selectedID = id
        case .selectNext, .selectPrevious:
            commitRename(&state)
            guard !state.rows.isEmpty else { return state }
            let step = event == .selectNext ? 1 : -1
            let index = state.rows.firstIndex { $0.id == state.selectedID }
            let next = index.map { min(max($0 + step, 0), state.rows.count - 1) }
                ?? (step > 0 ? 0 : state.rows.count - 1)
            state.selectedID = state.rows[next].id
        case let .retry(id):
            guard !state.busy, !state.retrying.contains(id), let row = state.rows.first(where: { $0.id == id }),
                  row.editable, row.canRetry else { return state }
            state.retrying.insert(id)
            state.failure = nil
            ask([.clearFailure, .retrySummary(id)], &state)
        case let .open(id):
            guard !state.busy, !state.opening else { return state }
            state.editing = nil
            state.failure = nil
            state.opening = true
            ask([.clearFailure, .openFolder(id)], &state)
        case let .openFinished(id, outcome):
            guard state.opening else { return state }
            state.opening = false
            switch outcome {
            case .opened: break
            case .notOpened: state.failure = .openFailed(id: id)
            case let .locationFailed(reason): state.failure = .locationFailed(id: id, reason: reason)
            }
        case let .retryFinished(id, succeeded):
            guard state.retrying.remove(id) != nil else { return state }
            if !succeeded { state.failure = .retryFailed }
        }
        return state
    }

    private func filter(_ state: inout CallsListMachineState) {
        let split = splitQuery(state.query)
        var keys = Set<String>()
        state.filterTags = (state.chosenTags + split.tags).filter { keys.insert(tagKey($0)).inserted }
        state.searchText = split.text
    }

    private func commitRename(_ state: inout CallsListMachineState) {
        guard let edit = state.editing else { return }
        state.editing = nil
        state.failure = nil
        ask([.rename(id: edit.id, title: edit.title)], &state)
    }

    private func ask(_ requests: [CallsListMachineState.Request], _ state: inout CallsListMachineState) {
        state.requests = requests
        state.asked += 1
    }
}
