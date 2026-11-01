import Recording
import Testing

func assert(
    _ state: RecordingState, _ event: RecordingEvent, reducedTo expected: RecordingState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(RecordingReducer.reduce(state, event) == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
