import IMRxObservation
import Observation
import Session

/// A Session composed as the app composes it: the reducer and the effect handler in the
/// generic model. Tests send it events and watch the states it publishes.
@MainActor
final class TestSession {

    private let model: ObservableModel<SessionState, SessionEvent, SessionEffect>

    init(handler: SessionEffectHandler) {

        model = ObservableModel(initialState: .init(), reduce: SessionReducer.reduce, handleEffect: { effect in
            AsyncStream { events in
                let task = Task {
                    events.yield(await handler.handle(effect))
                    events.finish()
                }
                events.onTermination = { _ in task.cancel() }
            }
        })
    }

    func send(_ event: SessionEvent) { model.event(event) }

    /// The first published state that matches, starting with the current one; nil once the
    /// waiting task is cancelled. States that change quickly may be seen only as the last one.
    func state(where matches: (SessionState) -> Bool) async -> SessionState? {

        for await state in Observations({ self.model.state }) where matches(state) { return state }
        return nil
    }
}
