import CallNames
import IMRxObservation
import Recording
import SpeakerNaming

/// Composes the app's one naming model and the sources each call watches.
@MainActor
final class ApplicationCallNames {
    private let model: ObservableModel<CallNamesModelState, CallNamesEvent, CallNamesEffect>
    private let feed = StateFeed<CallNamesModelState>()
    private let now: @Sendable () -> Double
    private let makeWatch: (@escaping @Sendable () async -> Double?) -> CallAppWatch

    init(now: @escaping @Sendable () -> Double,
         makeWatch: @escaping (@escaping @Sendable () async -> Double?) -> CallAppWatch) {
        self.now = now
        self.makeWatch = makeWatch
        let reducer = CallNamesReducer(
            name: { LiveNames().match(start: $0, end: $1, roster: $2, activities: $3, through: $4) },
            confirm: { rows, turns, evidence in
                AfterCallNames.names(rows: rows.map { ($0.id, $0.start, $0.end) }, turns: turns, evidence: evidence)
            })
        let handler = CallNamesEffectHandler()
        let feed = feed
        model = ObservableModel(initialState: .init(), reduce: { state, event in
            let result = reducer.reduce(state, event)
            // A final confirmation and release can reduce before observation resumes.
            if result.0 != state { feed.publish(result.0) }
            return result
        }, handleEffect: handler.handle)
    }

    func send(_ event: CallNamesEvent) { model.event(event) }

    func observation(of id: UInt64) -> CallNamesState.Observation? {
        let state = model.state
        if state.stoppingWatches.contains(id) { return .stopping }
        return state.calls[id]?.names.observation
    }

    func sessionChanged(id: UInt64, phase: SessionState.Phase, hasTranscript: Bool, at instant: Double) {
        send(.update(id, .recordingChanged(isOn: phase == .recording, at: instant)))
        if phase == .ended {
            send(.sessionEnded(id, hasTranscript: hasTranscript))
        }
    }

    func open(id: UInt64, published: RecordingNames) {
        let clock: @MainActor @Sendable () -> Double? = { [weak self] in
            guard let self, let start = model.state.calls[id]?.names.recordingStart else { return nil }
            return now() - start
        }
        published.connect(diarized: { [weak self] turns, rows in
            await self?.send(.update(id, .diarized(turns, rows: rows)))
        }, finalized: { [weak self] in
            await self?.send(.finalized(id))
        })

        let changes = feed.subscribe(from: model.state)
        Task {
            defer { published.finish() }
            var previous: CallNamesState?
            for await state in changes {
                guard let names = state.calls[id]?.names else {
                    if previous != nil { break }
                    continue
                }
                guard names != previous else { continue }
                published.published(names)
                previous = names
            }
        }
        send(.start(id, makeWatch(clock)))
    }

    isolated deinit { feed.finish() }
}
