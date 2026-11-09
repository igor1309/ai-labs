import Session
import Testing

/// Expects the state after `event` to be `state` with `change` applied; no change by default.
func assert(
    _ state: SessionState, _ event: SessionEvent,
    reducer: SessionReducer? = nil,
    _ change: (inout SessionState) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {

    var expected = state
    change(&expected)
    let reduce = reducer?.reduce ?? SessionReducer.reduce
    #expect(reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: SessionState, _ event: SessionEvent, delivers expected: SessionEffect?,
    reducer: SessionReducer? = nil,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    let reduce = reducer?.reduce ?? SessionReducer.reduce
    #expect(reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
