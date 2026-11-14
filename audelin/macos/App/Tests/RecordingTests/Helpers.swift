import Recording
import Testing

func assert(
    _ state: RecordingState, _ event: RecordingEvent,
    sourceLocation: SourceLocation = #_sourceLocation,
    mutation: (inout RecordingState) -> Void = { _ in }
) {
    var expected = state
    mutation(&expected)
    #expect(RecordingReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: RecordingState, _ event: RecordingEvent, delivers effect: RecordingEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(RecordingReducer.reduce(state, event).1 == effect, "\(state) + \(event)", sourceLocation: sourceLocation)
}
