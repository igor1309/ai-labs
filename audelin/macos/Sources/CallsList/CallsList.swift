/// Owns the calls list's selection, inline rename editing and summary retries.
public struct CallsListMachineState: Equatable, Sendable {
    public struct Row: Equatable, Sendable {
        public var id: String
        public var title: String
        public var editable: Bool
        /// The call's failed summary can be made again.
        public var canRetry: Bool

        public init(id: String, title: String, editable: Bool, canRetry: Bool = false) {
            self.id = id; self.title = title; self.editable = editable; self.canRetry = canRetry
        }
    }

    public struct Editing: Equatable, Sendable {
        public var id: String
        public var title: String

        public init(id: String, title: String) {
            self.id = id; self.title = title
        }
    }

    /// What the list asks of others: Recordings renames and clears its failure, SummaryJobs retries.
    public enum Request: Equatable, Sendable {
        case rename(id: String, title: String)
        case clearFailure
        case retrySummary(String)
    }

    /// Why the list's own last action failed.
    public enum Failure: Equatable, Sendable {
        case retryFailed
    }

    public var rows: [Row]
    public var busy: Bool
    /// The selected call; a search can hide it from `rows` and show it again.
    public var selectedID: String?
    public var editing: Editing?
    /// Calls whose summary retry is running; they cannot be retried again until it answers.
    public var retrying: Set<String>
    public var failure: Failure?
    /// The requests the latest asking event made, in order.
    public var requests: [Request]
    /// How many events have made requests; new requests are sent when it grows.
    public var asked: Int

    public init(rows: [Row] = [], busy: Bool = false, selectedID: String? = nil, editing: Editing? = nil,
                retrying: Set<String> = [], failure: Failure? = nil, requests: [Request] = [], asked: Int = 0) {
        self.rows = rows; self.busy = busy; self.selectedID = selectedID; self.editing = editing
        self.retrying = retrying; self.failure = failure; self.requests = requests; self.asked = asked
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
    /// Another action began that replaces the shown failure.
    case dismissFailure
}

public struct CallsListReducer: Sendable {
    public init() {}

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
        case .confirmDelete, .dismissFailure: state.failure = nil
        case .shown:
            state.editing = nil
            state.failure = nil
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
        case let .retryFinished(id, succeeded):
            guard state.retrying.remove(id) != nil else { return state }
            if !succeeded { state.failure = .retryFailed }
        }
        return state
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
