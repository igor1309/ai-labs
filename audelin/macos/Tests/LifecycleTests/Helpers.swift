import Lifecycle
import Testing

func makeState(_ state: LifecycleState = .running) -> LifecycleState { state }

func assert(
    _ state: LifecycleState, _ event: LifecycleEvent,
    _ update: (inout LifecycleState) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {

    var expected = state
    update(&expected)
    #expect(LifecycleReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: LifecycleState, _ event: LifecycleEvent, delivers expected: LifecycleEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(LifecycleReducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

/// Handles `effect`, runs `action` once the handler waits on a collaborator,
/// and expects `expected` as the event it returns.
func expect(
    _ sut: LifecycleEffectHandler, with effect: LifecycleEffect, toDeliver expected: LifecycleEvent,
    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation
) async {

    async let event = sut.handle(effect)
    await action()
    #expect(await event == expected, sourceLocation: sourceLocation)
}
