import IMRxObservation
import Lifecycle
import Observation
import Reading
import Recording
import Recordings
import SettingsUI

/// Each recording's reading model, reducing on the main actor.
@MainActor
func makeReading() -> ReadingInputs {

    let model = ObservableModel<ReadingState, ReadingEvent, Never>(
        initialState: .init(), reduce: readingReducer().reduce, handleEffect: noEvents
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

/// Recording's async model on the main actor; its effect handler runs call audio and the pieces' work.
@MainActor
func makeRecording(
    initial: RecordingState, log: @escaping @Sendable (RecordingState) -> Void,
    folderClaim: RecordingFolderClaim,
    sleep: @escaping @Sendable (Duration) async -> Void,
    callAudioReady: @escaping @Sendable () async -> Bool,
    liveText: @escaping @Sendable () -> Bool,
    callAudioReleased: @escaping @Sendable () async -> Void,
    runPiece: @escaping @Sendable (UInt64, SessionEffect) async -> SessionEvent,
    status: @escaping @Sendable (SessionState) -> RecordingSessionStatus
) -> RecordingInputs {

    let handler = RecordingEffectHandler(sleep: sleep, claimFolder: folderClaim.take, releaseFolder: folderClaim.release,
                                         prepareCallAudio: callAudioReady, liveText: liveText,
                                         releaseCallAudio: callAudioReleased, runPiece: runPiece)
    let model = RecordingModel(initial: initial, reducer: RecordingReducer(session: SessionReducer.reduce, status: status),
                               handler: handler, log: log)
    var inputs = RecordingInputs(
        send: { await model.send($0) },
        state: { await model.state },
        states: { await model.states() },
        end: { await model.end() }
    )
    return inputs
}

/// Holds the async model on the main actor; callers elsewhere await the hop.
@MainActor
final class RecordingModel {

    private let model: ObservableModel<RecordingState, RecordingEvent, RecordingEffect>
    private let feed = StateFeed<RecordingState>()

    init(initial: RecordingState, reducer: RecordingReducer, handler: RecordingEffectHandler, log: @escaping @Sendable (RecordingState) -> Void) {

        let feed = feed
        model = ObservableModel(initialState: initial, reduce: { state, event in
            guard !feed.finished else { return (state, nil) }
            let (next, effect) = reducer.reduce(state, event)
            if next != state {
                log(next)
                feed.publish(next)
            }
            return (next, effect)
        }, handleEffect: { effect in oneEvent { await handler.handle(effect) } })
    }

    var state: RecordingState { model.state }

    func send(_ event: RecordingEvent) { model.event(event) }

    /// Starts with the current state and retains every change.
    func states() -> AsyncStream<RecordingState> { feed.subscribe(from: model.state) }

    /// Finishes every states stream; later ones finish at once and later events change nothing.
    func end() { feed.finish() }
}

/// The termination machine: publishes the quit intention and terminates once every participant settled.
@MainActor
func makeTermination(claimFolder: @escaping @Sendable () async -> UInt64?, releaseFolder: @escaping @Sendable (UInt64) async -> Void,
                     relaunch: @escaping @Sendable () async -> Bool, unsettled: Set<TerminationParticipant>,
                     terminate: @escaping @Sendable () async -> Void) -> ObservableModel<TerminationState, TerminationEvent, TerminationEffect> {

    let handler = TerminationEffectHandler(claimFolder: claimFolder, releaseFolder: releaseFolder, relaunch: relaunch, terminate: terminate)
    return ObservableModel(initialState: TerminationState(unsettled: unsettled), reduce: TerminationReducer.reduce,
                           handleEffect: { effect in oneEvent { await handler.handle(effect) } })
}

@MainActor
func makeRecordings(handler: RecordingsEffectHandler, text: @escaping @Sendable () -> SettingsText,
                    initial: RecordingsState = .init()) -> RecordingsInputs {
    let feed = StateFeed<RecordingsState>()
    let reducer = recordingsReducer(text)
    let model = ObservableModel(initialState: initial, reduce: { state, event in
        let result = reducer.reduce(state, event)
        // Selection consumes transitions; observation may coalesce a run's start and end.
        if result.0 != state { feed.publish(result.0) }
        return result
    },
                                handleEffect: handler.handle)
    return RecordingsInputs(state: { model.state }, send: { model.event($0) },
                            states: { feed.subscribe(from: model.state) })
}

/// The calls list machine, with its text in the language `text` gives when it writes.
func recordingsReducer(_ text: @escaping @Sendable () -> SettingsText) -> RecordingsReducer {
    RecordingsReducer(failureMessage: { prior, refreshError in
        text()(.refreshFailed, prior, refreshError)
    }, moveText: folderMoveText(text), busyMessage: { text()(.callMergeBusy) },
                      transcriptMessage: { transcriptMessage($0, text: text()) })
}

func transcriptMessage(_ refusal: TranscriptRefusal, text: SettingsText) -> String {
    switch refusal {
    case .notIdle: text(.transcriptNotIdle)
    case .actionUnderWay: text(.transcriptActionUnderWay)
    case .noPreviousTranscript: text(.transcriptNoPrevious)
    case .callNotFound: text(.transcriptCallNotFound)
    case .recordingStarted: text(.transcriptRecordingStarted)
    case let .runningTranscript(id): text(.transcriptRunning, id)
    case let .missingTracks(tracks):
        text(.transcriptMissingTracks, tracks.map { text($0.track == .call ? .transcriptCallTrack : .transcriptMicrophoneTrack, $0.id) }.joined(separator: "; "))
    }
}
