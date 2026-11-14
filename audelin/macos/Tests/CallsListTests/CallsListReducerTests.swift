import CallsList
import Testing

struct CallsListReducerTests {
    @Test(arguments: rowChanges)
    fileprivate func rowsChanged_state(test: RowChange) {
        assert(makeState(busy: !test.busy, selectedID: test.selectedID, editing: makeEditing()),
               .rowsChanged(test.rows, busy: test.busy)) {
            $0.rows = test.rows
            $0.busy = test.busy
        }
    }
    @Test(arguments: rowChanges)
    fileprivate func rowsChanged_request(test: RowChange) {
        assert(makeState(busy: !test.busy, selectedID: test.selectedID, editing: makeEditing()),
               .rowsChanged(test.rows, busy: test.busy), delivers: nil)
    }

    @Test(arguments: [false, true], ["", "Row title"])
    func beginRenameUsesRowTitle_state(alreadyEditing: Bool, title: String) {
        assert(makeState(rows: [makeRow(id: "b", title: title)], selectedID: "b",
                         editing: alreadyEditing ? makeEditing() : nil, failure: .retryFailed), .beginRename("b")) {
            $0.editing = .init(id: "b", title: title)
            $0.failure = nil
            $0.requests = [.clearFailure]
            $0.asked += 1
        }
    }
    @Test(arguments: [false, true], ["", "Row title"])
    func beginRenameUsesRowTitle_request(alreadyEditing: Bool, title: String) {
        assert(makeState(rows: [makeRow(id: "b", title: title)], selectedID: "b",
                         editing: alreadyEditing ? makeEditing() : nil, failure: .retryFailed), .beginRename("b"), delivers: [.clearFailure])
    }

    @Test(arguments: refusedRenames, [false, true])
    fileprivate func beginRenameRefused_state(test: RefusedRename, alreadyEditing: Bool) {
        assert(makeState(rows: test.rows, busy: test.busy, editing: alreadyEditing ? makeEditing() : nil),
               .beginRename(test.id))
    }
    @Test(arguments: refusedRenames, [false, true])
    fileprivate func beginRenameRefused_request(test: RefusedRename, alreadyEditing: Bool) {
        assert(makeState(rows: test.rows, busy: test.busy, editing: alreadyEditing ? makeEditing() : nil),
               .beginRename(test.id), delivers: nil)
    }

    @Test(arguments: ["", "  New title  ", "Звонок 🐦"])
    func editTitle_state(title: String) {
        assert(makeState(editing: makeEditing()), .editTitle(title)) { $0.editing?.title = title }
    }
    @Test(arguments: ["", "  New title  ", "Звонок 🐦"])
    func editTitle_request(title: String) {
        assert(makeState(editing: makeEditing()), .editTitle(title), delivers: nil)
    }

    @Test(arguments: ["", "  New title  ", "Звонок 🐦"])
    func submitRename_state(title: String) {
        assert(makeState(editing: makeEditing(title: title), failure: .retryFailed), .submitRename) {
            $0.editing = nil
            $0.failure = nil
            $0.requests = [.rename(id: "a", title: title)]
            $0.asked += 1
        }
    }
    @Test(arguments: ["", "  New title  ", "Звонок 🐦"])
    func submitRename_request(title: String) {
        assert(makeState(editing: makeEditing(title: title), failure: .retryFailed), .submitRename, delivers: [.rename(id: "a", title: title)])
    }

    @Test(arguments: [CallsListMachineEvent.cancelRename, .askDelete("a"), .askDelete("b"), .askDelete("missing")],
          [false, true])
    func cancelOrAskDeleteEndsEditing_state(event: CallsListMachineEvent, busy: Bool) {
        assert(makeState(busy: busy, selectedID: "b", editing: makeEditing(), failure: .retryFailed), event) {
            $0.editing = nil
            if event != .cancelRename { $0.failure = nil }
        }
    }
    @Test(arguments: [CallsListMachineEvent.cancelRename, .askDelete("a"), .askDelete("b"), .askDelete("missing")],
          [false, true])
    func cancelOrAskDeleteEndsEditing_request(event: CallsListMachineEvent, busy: Bool) {
        assert(makeState(busy: busy, selectedID: "b", editing: makeEditing(), failure: .retryFailed), event, delivers: nil)
    }

    @Test(arguments: [CallsListMachineEvent.editTitle("ignored"), .cancelRename, .submitRename, .askDelete("a")])
    func renameEventWithoutEditing_state(event: CallsListMachineEvent) { assert(makeState(), event) }
    @Test(arguments: [CallsListMachineEvent.editTitle("ignored"), .cancelRename, .submitRename, .askDelete("a")])
    func renameEventWithoutEditing_request(event: CallsListMachineEvent) { assert(makeState(), event, delivers: nil) }

    @Test(arguments: ["a", "b", "missing"], [false, true])
    func selectWithoutEditing_state(id: String, busy: Bool) {
        assert(makeState(busy: busy), .select(id)) { $0.selectedID = id }
    }
    @Test(arguments: ["a", "b", "missing"], [false, true])
    func selectWithoutEditing_request(id: String, busy: Bool) {
        assert(makeState(busy: busy), .select(id), delivers: nil)
    }

    @Test func selectEditedCallKeepsEditing_state() {
        assert(makeState(selectedID: "b", editing: makeEditing()), .select("a")) { $0.selectedID = "a" }
    }
    @Test func selectEditedCallKeepsEditing_request() {
        assert(makeState(selectedID: "b", editing: makeEditing()), .select("a"), delivers: nil)
    }

    @Test(arguments: ["b", "missing"], [false, true])
    func selectAnotherCallCommitsRename_state(id: String, busy: Bool) {
        assert(makeState(busy: busy, selectedID: "a", editing: makeEditing(), failure: .retryFailed), .select(id)) {
            $0.editing = nil
            $0.failure = nil
            $0.selectedID = id
            $0.requests = [.rename(id: "a", title: "Draft title")]
            $0.asked += 1
        }
    }
    @Test(arguments: ["b", "missing"], [false, true])
    func selectAnotherCallCommitsRename_request(id: String, busy: Bool) {
        assert(makeState(busy: busy, selectedID: "a", editing: makeEditing(), failure: .retryFailed), .select(id),
               delivers: [.rename(id: "a", title: "Draft title")])
    }

    @Test(arguments: moves, [false, true])
    fileprivate func navigation_state(test: Move, editing: Bool) {
        assert(makeState(rows: test.rows, selectedID: test.selection, editing: editing ? makeEditing() : nil), test.event) {
            $0.editing = nil
            $0.selectedID = test.expectedSelection
            if editing {
                $0.requests = [.rename(id: "a", title: "Draft title")]
                $0.asked += 1
            }
        }
    }
    @Test(arguments: moves, [false, true])
    fileprivate func navigation_request(test: Move, editing: Bool) {
        assert(makeState(rows: test.rows, selectedID: test.selection, editing: editing ? makeEditing() : nil), test.event,
               delivers: editing ? [.rename(id: "a", title: "Draft title")] : nil)
    }

    @Test func recordingTheEditedCallEndsEditing_state() {
        assert(makeState(selectedID: "b", editing: makeEditing()), .recordingChanged(id: "a")) { $0.editing = nil }
    }
    @Test func recordingTheEditedCallEndsEditing_request() {
        assert(makeState(selectedID: "b", editing: makeEditing()), .recordingChanged(id: "a"), delivers: nil)
    }

    @Test(arguments: [String?.none, "b"], [false, true])
    func otherRecordingChangesDoNothing_state(id: String?, editing: Bool) {
        assert(makeState(editing: editing ? makeEditing() : nil), .recordingChanged(id: id))
    }
    @Test(arguments: [String?.none, "b"], [false, true])
    func otherRecordingChangesDoNothing_request(id: String?, editing: Bool) {
        assert(makeState(editing: editing ? makeEditing() : nil), .recordingChanged(id: id), delivers: nil)
    }
    @Test(arguments: [CallsListMachineEvent.confirmDelete, .dismissFailure, .shown], [false, true])
    func actionReplacesFailure_state(event: CallsListMachineEvent, editing: Bool) {
        assert(makeState(editing: editing ? makeEditing() : nil, failure: .retryFailed), event) {
            $0.failure = nil
            if event == .shown { $0.editing = nil }
        }
    }
    @Test(arguments: [CallsListMachineEvent.confirmDelete, .dismissFailure, .shown], [false, true])
    func actionReplacesFailure_request(event: CallsListMachineEvent, editing: Bool) {
        assert(makeState(editing: editing ? makeEditing() : nil, failure: .retryFailed), event, delivers: nil)
    }

    @Test(arguments: [String?.none, "b"])
    func retryStartsAndAsksForIt_state(retryingOther: String?) {
        assert(makeState(rows: [makeRow(id: "a", canRetry: true)], retrying: Set([retryingOther].compactMap { $0 }),
                         failure: .retryFailed), .retry("a")) {
            $0.retrying.insert("a")
            $0.failure = nil
            $0.requests = [.clearFailure, .retrySummary("a")]
            $0.asked += 1
        }
    }
    @Test(arguments: [String?.none, "b"])
    func retryStartsAndAsksForIt_request(retryingOther: String?) {
        assert(makeState(rows: [makeRow(id: "a", canRetry: true)], retrying: Set([retryingOther].compactMap { $0 }),
                         failure: .retryFailed), .retry("a"), delivers: [.clearFailure, .retrySummary("a")])
    }

    @Test(arguments: refusedRetries)
    fileprivate func retryRefused_state(test: RefusedRetry) {
        assert(makeState(rows: test.rows, busy: test.busy, retrying: test.retrying, failure: .retryFailed), .retry("a"))
    }
    @Test(arguments: refusedRetries)
    fileprivate func retryRefused_request(test: RefusedRetry) {
        assert(makeState(rows: test.rows, busy: test.busy, retrying: test.retrying, failure: .retryFailed), .retry("a"),
               delivers: nil)
    }

    @Test(arguments: [true, false])
    func retryFinishedEndsRetrying_state(succeeded: Bool) {
        assert(makeState(retrying: ["a", "b"]), .retryFinished("a", succeeded: succeeded)) {
            $0.retrying = ["b"]
            if !succeeded { $0.failure = .retryFailed }
        }
    }
    @Test(arguments: [true, false])
    func retryFinishedEndsRetrying_request(succeeded: Bool) {
        assert(makeState(retrying: ["a", "b"]), .retryFinished("a", succeeded: succeeded), delivers: nil)
    }

    @Test(arguments: [true, false])
    func retryFinishedForCallNotRetrying_state(succeeded: Bool) {
        assert(makeState(retrying: ["b"]), .retryFinished("a", succeeded: succeeded))
    }
    @Test(arguments: [true, false])
    func retryFinishedForCallNotRetrying_request(succeeded: Bool) {
        assert(makeState(retrying: ["b"]), .retryFinished("a", succeeded: succeeded), delivers: nil)
    }
}

private struct RefusedRetry: Sendable {
    let rows: [CallsListMachineState.Row]
    let busy: Bool
    let retrying: Set<String>
}

private let refusedRetries: [RefusedRetry] = [
    .init(rows: [makeRow(id: "a", canRetry: true)], busy: true, retrying: []),
    .init(rows: [makeRow(id: "a", canRetry: true)], busy: false, retrying: ["a"]),
    .init(rows: [makeRow(id: "a", editable: false, canRetry: true)], busy: false, retrying: []),
    .init(rows: [makeRow(id: "a")], busy: false, retrying: []),
    .init(rows: [makeRow(id: "b", canRetry: true)], busy: false, retrying: []),
]


private struct RowChange: Sendable {
    let rows: [CallsListMachineState.Row]
    let busy: Bool
    let selectedID: String?
}

private let rowChanges: [RowChange] = [false, true].flatMap { busy in
    [
        RowChange(rows: [makeRow(id: "b", title: "Renamed", editable: false)], busy: busy,
                  selectedID: "b"),
        RowChange(rows: [makeRow(id: "b")], busy: busy, selectedID: "a"),
        RowChange(rows: [], busy: busy, selectedID: "a"),
        RowChange(rows: [makeRow(id: "a")], busy: busy, selectedID: nil),
    ]
}

private struct RefusedRename: Sendable {
    let rows: [CallsListMachineState.Row]
    let busy: Bool
    let id: String
}

private let refusedRenames: [RefusedRename] = [
    .init(rows: [makeRow(id: "a")], busy: true, id: "a"),
    .init(rows: [makeRow(id: "a", editable: false)], busy: false, id: "a"),
    .init(rows: [makeRow(id: "a")], busy: false, id: "missing"),
    .init(rows: [], busy: false, id: "a"),
]

private struct Move: Sendable {
    let rows: [CallsListMachineState.Row]
    let selection: String?
    let event: CallsListMachineEvent
    let expectedSelection: String?
}

private let moves: [Move] = {
    let rows = [makeRow(id: "a"), makeRow(id: "b"), makeRow(id: "c")]
    return [
        Move(rows: rows, selection: "a", event: .selectNext, expectedSelection: "b"),
        Move(rows: rows, selection: "b", event: .selectNext, expectedSelection: "c"),
        Move(rows: rows, selection: "c", event: .selectNext, expectedSelection: "c"),
        Move(rows: rows, selection: "c", event: .selectPrevious, expectedSelection: "b"),
        Move(rows: rows, selection: "b", event: .selectPrevious, expectedSelection: "a"),
        Move(rows: rows, selection: "a", event: .selectPrevious, expectedSelection: "a"),
        Move(rows: rows, selection: nil, event: .selectNext, expectedSelection: "a"),
        Move(rows: rows, selection: nil, event: .selectPrevious, expectedSelection: "c"),
        Move(rows: rows, selection: "missing", event: .selectNext, expectedSelection: "a"),
        Move(rows: rows, selection: "missing", event: .selectPrevious, expectedSelection: "c"),
    ] + [CallsListMachineEvent.selectNext, .selectPrevious].flatMap { event in
        [Move(rows: [], selection: nil, event: event, expectedSelection: nil),
         Move(rows: [], selection: "a", event: event, expectedSelection: "a"),
         Move(rows: [makeRow(id: "a")], selection: "a", event: event, expectedSelection: "a")]
    }
}()

private func makeRow(id: String, title: String = "Row title", editable: Bool = true,
                     canRetry: Bool = false) -> CallsListMachineState.Row {
    .init(id: id, title: title, editable: editable, canRetry: canRetry)
}

private func makeEditing(title: String = "Draft title") -> CallsListMachineState.Editing {
    .init(id: "a", title: title)
}

private func makeState(rows: [CallsListMachineState.Row] = [makeRow(id: "a"), makeRow(id: "b"), makeRow(id: "c")],
                       busy: Bool = false, selectedID: String? = nil,
                       editing: CallsListMachineState.Editing? = nil, retrying: Set<String> = [],
                       failure: CallsListMachineState.Failure? = nil) -> CallsListMachineState {
    .init(rows: rows, busy: busy, selectedID: selectedID, editing: editing, retrying: retrying, failure: failure)
}

private func assert(_ state: CallsListMachineState, _ event: CallsListMachineEvent,
                    sourceLocation: SourceLocation = #_sourceLocation,
                    mutation: (inout CallsListMachineState) -> Void = { _ in }) {
    var expected = state
    mutation(&expected)
    #expect(CallsListReducer().reduce(state, event) == expected, sourceLocation: sourceLocation)
}

private func assert(_ state: CallsListMachineState, _ event: CallsListMachineEvent, delivers requests: [CallsListMachineState.Request]?,
                    sourceLocation: SourceLocation = #_sourceLocation) {
    let next = CallsListReducer().reduce(state, event)
    #expect((next.asked > state.asked ? next.requests : nil) == requests, sourceLocation: sourceLocation)
}
