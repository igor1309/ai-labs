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

/// Handles `effect`, runs `action` once the handler waits on a collaborator,
/// and expects exactly `expected` before the stream finishes.
func expect(
    _ sut: RecordingEffectHandler, with effect: RecordingEffect, toDeliver expected: RecordingEvent,
    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation
) async {

    let events = Task {
        var events: [RecordingEvent] = []
        for await event in sut.handle(effect) { events.append(event) }
        return events
    }
    await action()
    #expect(await events.value == [expected], sourceLocation: sourceLocation)
}
