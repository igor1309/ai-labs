import Session
import Testing

/// Expects the state after `event` to be `state` with `change` applied; no change by default.
func assert(
    _ state: SessionState, _ event: SessionEvent, _ change: (inout SessionState) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {

    var expected = state
    change(&expected)
    #expect(SessionReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: SessionState, _ event: SessionEvent, delivers expected: SessionEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(SessionReducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
