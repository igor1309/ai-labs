import Recording
import Testing

func assert(
    _ state: RecordingState, _ event: RecordingEvent, reducedTo expected: RecordingState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(RecordingReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: RecordingState, _ event: RecordingEvent, effect expected: RecordingEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(RecordingReducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
