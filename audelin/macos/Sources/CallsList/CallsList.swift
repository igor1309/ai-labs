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

    public var rows: [Row]
    public var busy: Bool
    public var selectedID: String?
    public var editing: Editing?

    public init(rows: [Row] = [], busy: Bool = false, selectedID: String? = nil, editing: Editing? = nil) {
        self.rows = rows; self.busy = busy; self.selectedID = selectedID; self.editing = editing
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

public enum CallsListEffect: Equatable, Sendable {
    case rename(id: String, title: String)
    case clearFailure
}

public struct CallsListReducer: Sendable {
    public init() {}

    public func reduce(_ state: CallsListMachineState, _ event: CallsListMachineEvent)
        -> (CallsListMachineState, CallsListEffect?) {
        var state = state
        switch event {
        case let .rowsChanged(rows, busy):
            state.rows = rows
            state.busy = busy
            if !rows.contains(where: { $0.id == state.selectedID }) { state.selectedID = nil }
        case let .recordingChanged(id):
            if state.editing?.id == id { state.editing = nil }
        case let .beginRename(id):
            guard !state.busy, let row = state.rows.first(where: { $0.id == id }), row.editable else {
                return (state, nil)
            }
            state.editing = .init(id: id, title: row.title)
            return (state, .clearFailure)
        case let .editTitle(title): state.editing?.title = title
        case .cancelRename, .askDelete: state.editing = nil
        case .submitRename: return commitRename(state)
        case let .select(id):
            let effect: CallsListEffect?
            if state.editing?.id != id { (state, effect) = commitRename(state) }
            else { effect = nil }
            state.selectedID = id
            return (state, effect)
        case .selectNext, .selectPrevious:
            let (committed, effect) = commitRename(state)
            state = committed
            guard !state.rows.isEmpty else { return (state, effect) }
            let step = event == .selectNext ? 1 : -1
            let index = state.rows.firstIndex { $0.id == state.selectedID }
            let next = index.map { min(max($0 + step, 0), state.rows.count - 1) }
                ?? (step > 0 ? 0 : state.rows.count - 1)
            state.selectedID = state.rows[next].id
            return (state, effect)
        }
        return (state, nil)
    }

    private func commitRename(_ state: CallsListMachineState) -> (CallsListMachineState, CallsListEffect?) {
        guard let edit = state.editing else { return (state, nil) }
        var state = state
        state.editing = nil
        return (state, .rename(id: edit.id, title: edit.title))
    }
}

/// Forwards requests to the recordings port; outcomes arrive through row updates.
public struct CallsListEffectHandler: Sendable {
    private let recordings: @Sendable (CallsListEffect) async -> Void

    public init(recordings: @escaping @Sendable (CallsListEffect) async -> Void) {
        self.recordings = recordings
    }

    public func handle(_ effect: CallsListEffect) async {
        await recordings(effect)
    }
}
