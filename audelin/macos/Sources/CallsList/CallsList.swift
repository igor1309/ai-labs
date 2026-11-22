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

    /// The one call whose tags are being edited, its draft, the tag being typed, and while a save
    /// is pending its request id.
    public struct TagsEditor: Equatable, Sendable {
        public var id: String
        public var draft: [String]
        public var pending: Int?
        /// Why the last save failed; the draft stays for a retry.
        public var failure: String?
        /// The tag being typed.
        public var entry: String
        /// The rest of a tag in use that the entry starts, taken with Tab.
        public var completion: String
        /// The tags on every call when editing began, offered as completions.
        public var inUse: [String]
        public init(id: String, draft: [String], pending: Int? = nil, failure: String? = nil,
                    entry: String = "", completion: String = "", inUse: [String] = []) {
            self.id = id; self.draft = draft; self.pending = pending; self.failure = failure
            self.entry = entry; self.completion = completion; self.inUse = inUse
        }
    }

    /// How a tags save ended, as Recordings answers it, echoing the request id.
    public enum TagsOutcome: Equatable, Sendable {
        case saved, failed(String)
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
        case setTags(request: Int, id: String, tags: [String])
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
    public var tagsEditor: TagsEditor?
    /// The last tags request id given; each submit takes the next.
    public var tagsRequest: Int

    public init(rows: [Row] = [], busy: Bool = false, selectedID: String? = nil, editing: Editing? = nil,
                retrying: Set<String> = [], failure: Failure? = nil, opening: Bool = false,
                requests: [Request] = [], asked: Int = 0, query: String = "", chosenTags: [String] = [],
                filterTags: [String] = [], searchText: String = "", tagsEditor: TagsEditor? = nil, tagsRequest: Int = 0) {
        self.rows = rows; self.busy = busy; self.selectedID = selectedID; self.editing = editing
        self.retrying = retrying; self.failure = failure; self.opening = opening; self.requests = requests; self.asked = asked
        self.query = query; self.chosenTags = chosenTags; self.filterTags = filterTags; self.searchText = searchText
        self.tagsEditor = tagsEditor; self.tagsRequest = tagsRequest
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
    /// Starts editing a call's tags, with the tags in use to complete from; unavailable while
    /// another call's save is pending.
    case beginTags(String, inUse: [String])
    case editTags([String])
    /// The tag being typed changed.
    case typeTag(String)
    /// Tab: the entry takes its completion.
    case completeTag
    case cancelTags, submitTags
    case tagsFinished(request: Int, CallsListMachineState.TagsOutcome)
}

public struct CallsListReducer: Sendable {
    private let splitQuery: @Sendable (String) -> (tags: [String], text: String)
    private let tagKey: @Sendable (String) -> String
    private let normalizeTags: @Sendable ([String]) -> [String]
    private let complete: @Sendable (_ entry: String, _ draft: [String], _ inUse: [String]) -> String

    /// `splitQuery` takes a query's `#tag` words out of its text; `tagKey` is the form two tags
    /// are compared in; `normalizeTags` makes a draft the tags to save; `complete` gives the rest
    /// of a tag in use that an entry starts and the draft lacks.
    public init(splitQuery: @escaping @Sendable (String) -> (tags: [String], text: String),
                tagKey: @escaping @Sendable (String) -> String,
                normalizeTags: @escaping @Sendable ([String]) -> [String],
                complete: @escaping @Sendable (_ entry: String, _ draft: [String], _ inUse: [String]) -> String) {
        self.splitQuery = splitQuery; self.tagKey = tagKey; self.normalizeTags = normalizeTags; self.complete = complete
    }

    public func reduce(_ state: CallsListMachineState, _ event: CallsListMachineEvent) -> CallsListMachineState {
        let asked = state.asked
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
            ask([.clearFailure], &state, since: asked)
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
            if state.tagsEditor?.pending == nil { state.tagsEditor = nil }
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
        case .submitRename: commitRename(&state, since: asked)
        case let .beginTags(id, inUse):
            guard !state.busy, let row = state.rows.first(where: { $0.id == id }), row.editable else { return state }
            if let editor = state.tagsEditor {
                guard editor.id != id else { return state }
                guard editor.pending == nil else { return state }
            }
            state.tagsEditor = .init(id: id, draft: row.tags, inUse: inUse)
        case let .editTags(draft):
            guard var editor = state.tagsEditor else { return state }
            editor.draft = draft
            state.tagsEditor = completed(editor)
        case let .typeTag(text):
            guard var editor = state.tagsEditor else { return state }
            editor.entry = text
            state.tagsEditor = completed(editor)
        case .completeTag:
            guard var editor = state.tagsEditor, !editor.completion.isEmpty else { return state }
            editor.entry += editor.completion
            state.tagsEditor = completed(editor)
        case .cancelTags:
            guard state.tagsEditor?.pending == nil else { return state }
            state.tagsEditor = nil
        case .submitTags: submitTags(&state, since: asked)
        case let .tagsFinished(request, outcome):
            guard let editor = state.tagsEditor, editor.pending == request else { return state }
            switch outcome {
            case .saved: state.tagsEditor = nil
            case let .failed(reason):
                state.tagsEditor?.pending = nil
                state.tagsEditor?.failure = reason
            }
        case let .select(id):
            if state.editing?.id != id { commitRename(&state, since: asked) }
            if state.tagsEditor?.id != id { submitTags(&state, since: asked, moving: true) }
            state.selectedID = id
        case .selectNext, .selectPrevious:
            commitRename(&state, since: asked)
            submitTags(&state, since: asked, moving: true)
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
            ask([.clearFailure, .retrySummary(id)], &state, since: asked)
        case let .open(id):
            guard !state.busy, !state.opening else { return state }
            state.editing = nil
            state.failure = nil
            state.opening = true
            ask([.clearFailure, .openFolder(id)], &state, since: asked)
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

    /// Saves the draft with the entry under a new request id; an answer to an earlier one no
    /// longer applies. Return always submits; a selection move submits only a draft not already pending.
    private func submitTags(_ state: inout CallsListMachineState, since asked: Int, moving: Bool = false) {
        guard let editor = state.tagsEditor, !moving || editor.pending == nil else { return }
        state.tagsRequest += 1
        let tags = normalizeTags(editor.draft + [editor.entry])
        state.tagsEditor = .init(id: editor.id, draft: tags, pending: state.tagsRequest, inUse: editor.inUse)
        ask([.setTags(request: state.tagsRequest, id: editor.id, tags: tags)], &state, since: asked)
    }

    private func completed(_ editor: CallsListMachineState.TagsEditor) -> CallsListMachineState.TagsEditor {
        var editor = editor
        editor.completion = complete(editor.entry, editor.draft, editor.inUse)
        return editor
    }

    private func filter(_ state: inout CallsListMachineState) {
        let split = splitQuery(state.query)
        var keys = Set<String>()
        state.filterTags = (state.chosenTags + split.tags).filter { keys.insert(tagKey($0)).inserted }
        state.searchText = split.text
    }

    private func commitRename(_ state: inout CallsListMachineState, since asked: Int) {
        guard let edit = state.editing else { return }
        state.editing = nil
        state.failure = nil
        ask([.rename(id: edit.id, title: edit.title)], &state, since: asked)
    }

    /// One event's requests, in order: a second ask in the same event adds to the first.
    private func ask(_ requests: [CallsListMachineState.Request], _ state: inout CallsListMachineState, since asked: Int) {
        if state.asked > asked { state.requests += requests; return }
        state.requests = requests
        state.asked += 1
    }
}
