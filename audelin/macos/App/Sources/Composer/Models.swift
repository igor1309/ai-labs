import IMRxObservation
import Lifecycle
import Observation
import Reading
import Recording
import Recordings
import Session
import SettingsUI

/// Each recording's reading model, reducing on the main actor.
@MainActor
func makeReading() -> ReadingInputs {

    let model = ObservableModel<ReadingState, ReadingEvent, Never>(
        initialState: .init(), reduce: ReadingReducer.reduce, handleEffect: noEvents
    )
    return ReadingInputs(state: { model.state }, send: { model.event($0) })
}

/// The handler for a model without effects. It is generic because the compiler warns on any body
/// taking `Never`: a closure given it "will never be executed".
private func noEvents<Effect, Event>(_: Effect) -> AsyncStream<Event> { AsyncStream { $0.finish() } }

/// The stream a model reads from a handler that returns one event.
func oneEvent<Event: Sendable>(_ handle: @escaping @Sendable () async -> Event) -> AsyncStream<Event> {

    AsyncStream { output in
        let task = Task {
            output.yield(await handle())
            output.finish()
        }
        output.onTermination = { _ in task.cancel() }
    }
}

/// Recording's model, reducing on the main actor, and the doer that makes the Session follow it.
@MainActor
func makeRecording(
    initial: RecordingState, session: any RecordingSession, log: @escaping @Sendable (RecordingState) -> Void,
    callAudioReady: @escaping @Sendable () async -> Bool,
    callAudioReleased: @escaping @Sendable () async -> Void
) -> RecordingInputs {

    let model = RecordingModel(initial: initial, log: log)
    let doer = RecordingDoer(session: session, callAudioReady: callAudioReady,
                             callAudioReleased: callAudioReleased, send: { await model.send($0) })
    let acting = Task { for await state in model.states() { doer.act(on: state) } }
    var inputs = RecordingInputs(
        send: { await model.send($0) },
        state: { await model.state },
        states: { await model.states() },
        end: { acting.cancel(); await model.end() }
    )
    inputs.reserveStorage = { await model.reserveStorage() }
    inputs.releaseStorage = { await model.send(.releaseStorage) }
    return inputs
}

/// Holds the sync model on the main actor; callers elsewhere await the hop.
@MainActor
final class RecordingModel {

    private let model: SyncModel<RecordingState, RecordingEvent>
    private let feed = StateFeed<RecordingState>()

    init(initial: RecordingState, log: @escaping @Sendable (RecordingState) -> Void) {

        let feed = feed
        model = SyncModel(initialState: initial, reduce: { state, event in
            guard !feed.finished else { return state }
            let next = RecordingReducer.reduce(state, event)
            if next != state {
                log(next)
                feed.publish(next)
            }
            return next
        })
    }

    var state: RecordingState { model.state }
    func reserveStorage() -> Bool {
        let previouslyReserved = model.state.storageReserved
        model.event(.reserveStorage)
        return !previouslyReserved && model.state.storageReserved
    }

    func send(_ event: RecordingEvent) { model.event(event) }

    /// Starts with the current state and retains every change.
    func states() -> AsyncStream<RecordingState> { feed.subscribe(from: model.state) }

    /// Finishes every states stream; later ones finish at once and later events change nothing.
    func end() { feed.finish() }
}

/// One Session's model, reducing on its own actor and running its effects through the handler.
func makeSession(handler: SessionEffectHandler) async -> SessionInputs {

    let model = SessionModel()
    await model.start(handler: handler)
    return SessionInputs(
        send: { await model.send($0) },
        states: { await model.states() },
        end: { await model.end() }
    )
}

/// Holds the observable model on its own actor, off the main actor; callers await the hop.
actor SessionModel {

    private var model: ObservableModel<SessionState, SessionEvent, SessionEffect>?
    // The state kept when the model is released at the end.
    private var ended: SessionState?
    private let feed = StateFeed<SessionState>()

    func start(handler: SessionEffectHandler) {

        let feed = feed
        model = ObservableModel(initialState: SessionState(), reduce: { state, event in
            guard !feed.finished else { return (state, nil) }
            let (next, effect) = SessionReducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in oneEvent { await handler.handle(effect) } }, isolation: self)
    }

    func send(_ event: SessionEvent) { model?.event(event) }

    /// Starts with the current state and retains every change.
    func states() -> AsyncStream<SessionState> { feed.subscribe(from: model?.state ?? ended ?? .init()) }

    /// Finishes every states stream; later ones finish at once and later events change nothing.
    func end() {
        feed.finish()
        // The model's loop holds this actor, so the model is released to end both.
        ended = model?.state
        model = nil
    }
}

/// The termination machine: publishes the quit intention and terminates once every participant settled.
@MainActor
func makeTermination(relaunch: @escaping @Sendable () async -> Bool, unsettled: Set<TerminationParticipant>,
                     terminate: @escaping @Sendable () async -> Void) -> ObservableModel<TerminationState, TerminationEvent, TerminationEffect> {

    let handler = TerminationEffectHandler(relaunch: relaunch, terminate: terminate)
    return ObservableModel(initialState: TerminationState(unsettled: unsettled), reduce: TerminationReducer.reduce,
                           handleEffect: { effect in oneEvent { await handler.handle(effect) } })
}

@MainActor
func makeRecordings(handler: RecordingsEffectHandler, text: @escaping @Sendable () -> SettingsText, initial: RecordingsState = .init()) -> RecordingsInputs {
    let model = ObservableModel(initialState: initial, reduce: recordingsReducer(text).reduce,
                                handleEffect: handler.handle)
    return RecordingsInputs(state: { model.state }, send: { model.event($0) })
}

/// The calls list machine, with its text in the language `text` gives when it writes.
func recordingsReducer(_ text: @escaping @Sendable () -> SettingsText) -> RecordingsReducer {
    RecordingsReducer(failureMessage: { prior, refreshError in
        text()(.refreshFailed, prior, refreshError)
    }, moveText: folderMoveText(text))
}
