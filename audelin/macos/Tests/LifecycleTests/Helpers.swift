import Lifecycle
import Testing

func assert(
    _ state: LifecycleState, _ event: LifecycleEvent, reducedTo expected: LifecycleState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(LifecycleReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: LifecycleState, _ event: LifecycleEvent, effect expected: LifecycleEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(LifecycleReducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

/// Handles `effect`, runs `action` once the handler waits on a collaborator,
/// and expects exactly `expected` before the stream finishes.
func expect(
    _ sut: LifecycleEffectHandler, with effect: LifecycleEffect, toDeliver expected: LifecycleEvent,
    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation
) async {

    let events = Task {
        var events: [LifecycleEvent] = []
        for await event in sut.handle(effect) { events.append(event) }
        return events
    }
    await action()
    #expect(await events.value == [expected], sourceLocation: sourceLocation)
}
