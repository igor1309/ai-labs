import IMRxObservation
import Observation
import SummaryJobs
import TranscriptFinalization

@MainActor @Observable
final class TranscriptFinalizationModel {
    typealias State = TranscriptFinalizationState<CallState, Transcript.Attributed, [TranscriptSegment]>
    typealias Event = TranscriptFinalizationEvent<CallState, Transcript.Attributed, [TranscriptSegment]>
    typealias Effect = TranscriptFinalizationEffect<CallState, Transcript.Attributed, [TranscriptSegment], Job.Entry>

    private let model: ObservableModel<State, Event, Effect>
    private let feed = StateFeed<State>()

    init(diarizing: any TranscriptDiarizing<CallState, Transcript.Attributed>,
         cleanup: any MicrophoneCleanup<CallState, Transcript.Attributed, [TranscriptSegment]>,
         replacement: any TranscriptReplacement<CallState, Transcript.Attributed, [TranscriptSegment]>,
         finals: any FinalTranscripts<Job.Entry>) {
        let reducer = TranscriptFinalizationReducer<CallState, Transcript.Attributed, [TranscriptSegment], Job.Entry>(
            entries: { summaryEntries($0, heard: $2, attributed: $1) })
        let handler = TranscriptFinalizationEffectHandler(diarizing: diarizing, cleanup: cleanup, replacement: replacement, finals: finals)
        let feed = feed
        model = ObservableModel(initialState: .init(), reduce: { state, event in
            let (next, effect) = reducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in
            let states = feed.subscribe(from: .init())
            return AsyncStream { output in
                let work = Task {
                    if let event = await handler.handle(effect) { output.yield(event) }
                    output.finish()
                }
                // Cleanup has no file side effects. Once its call is final, its model work
                // can stop without holding up quit; a late result is ignored by the reducer.
                let cancellation = Task {
                    guard case let .clean(call, _, _) = effect else { return }
                    for await state in states {
                        if let stage = state.calls[call]?.stage, stage == .finalized || stage == .failed {
                            work.cancel()
                            return
                        }
                    }
                }
                output.onTermination = { _ in work.cancel(); cancellation.cancel() }
            }
        })
    }

    var state: State { model.state }
    func send(_ event: Event) { model.event(event) }
    func states() -> AsyncStream<State> { feed.subscribe(from: model.state) }

    func shutdown() async {
        model.event(.shutdown)
        for await state in Observations({ self.model.state }) where state.settled { return }
    }
}
