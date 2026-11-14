/// Owns the calls list's selection and inline rename editing.
public struct CallsListMachineState: Equatable, Sendable {
    public struct Row: Equatable, Sendable {
        public var id: String
        public var title: String
        public var editable: Bool

        public init(id: String, title: String, editable: Bool) {
            self.id = id; self.title = title; self.editable = editable
        }
    }

    public struct Editing: Equatable, Sendable {
        public var id: String
        public var title: String

        public init(id: String, title: String) {
            self.id = id; self.title = title
        }
    }

    /// What the list asks of the calls it lists; Recordings does the work.
    public enum Request: Equatable, Sendable {
        case rename(id: String, title: String)
        case clearFailure
    }

    public var rows: [Row]
    public var busy: Bool
    /// The selected call; a search can hide it from `rows` and show it again.
    public var selectedID: String?
    public var editing: Editing?
    /// The latest request, nil before the first.
    public var request: Request?
    /// How many requests the list has made; a new one is sent when it grows.
    public var requests: Int

    public init(rows: [Row] = [], busy: Bool = false, selectedID: String? = nil, editing: Editing? = nil,
                request: Request? = nil, requests: Int = 0) {
        self.rows = rows; self.busy = busy; self.selectedID = selectedID; self.editing = editing
        self.request = request; self.requests = requests
    }
}

public enum CallsListMachineEvent: Equatable, Sendable {
    case rowsChanged([CallsListMachineState.Row], busy: Bool)
    case recordingChanged(id: String?)
    case beginRename(String)
    case editTitle(String)
    case cancelRename, submitRename
    case askDelete(String)
    case select(String)
    case selectNext, selectPrevious
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
            ask(.clearFailure, &state)
        case let .editTitle(title): state.editing?.title = title
        case .cancelRename, .askDelete: state.editing = nil
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
        }
        return state
    }

    private func commitRename(_ state: inout CallsListMachineState) {
        guard let edit = state.editing else { return }
        state.editing = nil
        ask(.rename(id: edit.id, title: edit.title), &state)
    }

    private func ask(_ request: CallsListMachineState.Request, _ state: inout CallsListMachineState) {
        state.request = request
        state.requests += 1
    }
}

