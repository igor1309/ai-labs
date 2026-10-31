import Session
import Testing

func assert(
    _ state: SessionState, _ event: SessionEvent, reducedTo expected: SessionState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(SessionReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: SessionState, _ event: SessionEvent, effect expected: SessionEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(SessionReducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
