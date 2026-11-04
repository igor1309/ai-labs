import Recording
import Testing

func assert(
    _ state: RecordingState, _ event: RecordingEvent,
    sourceLocation: SourceLocation = #_sourceLocation,
    mutation: (inout RecordingState) -> Void = { _ in }
) {
    var expected = state
    mutation(&expected)
    #expect(RecordingReducer.reduce(state, event) == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
