import CallNames
import IMRxObservation
import Observation
import SummaryJobs
import TranscriptFinalization

@MainActor @Observable
final class TranscriptFinalizationModel {
    typealias State = TranscriptFinalizationState<CallState, CallNamesState, Transcript.Attributed, [TranscriptSegment]>
    typealias Event = TranscriptFinalizationEvent<CallState, CallNamesState, Transcript.Attributed, [TranscriptSegment]>
    typealias Effect = TranscriptFinalizationEffect<CallState, CallNamesState, Transcript.Attributed, [TranscriptSegment], Job.Entry>

    private let model: ObservableModel<State, Event, Effect>
    private let feed = StateFeed<State>()

    init(diarizing: any TranscriptDiarizing<CallState, CallNamesState, Transcript.Attributed>,
         cleanup: any MicrophoneCleanup<CallState, Transcript.Attributed, [TranscriptSegment]>,
         replacement: any TranscriptReplacement<CallState, CallNamesState, Transcript.Attributed, [TranscriptSegment]>,
         finals: any FinalTranscripts<Job.Entry>) {
        let reducer = TranscriptFinalizationReducer<CallState, CallNamesState, Transcript.Attributed, [TranscriptSegment], Job.Entry>(
            entries: { summaryEntries($0, heard: $2, attributed: $1) })
        let handler = TranscriptFinalizationEffectHandler(diarizing: diarizing, cleanup: cleanup, replacement: replacement, finals: finals)
        let feed = feed
        model = ObservableModel(initialState: .init(), reduce: { state, event in
            let (next, effect) = reducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: handler.handle)
    }

    var state: State { model.state }
    func send(_ event: Event) { model.event(event) }
    func states() -> AsyncStream<State> { feed.subscribe(from: model.state) }

    /// Returns once shutdown, the end of transcript input and every final publication have settled.
    func settled() async {
        for await state in Observations({ self.model.state }) where state.settled { return }
    }
}
