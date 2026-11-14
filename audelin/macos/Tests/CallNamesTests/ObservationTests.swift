import CallNames
import Testing

struct ObservationTests {

    @Test func startWatchesTheCallApp() {
        let (sut, _) = makeSUT()
        assert(makeState(), .start, using: sut, delivering: .observe) { $0.observation = .observing }
    }

    @Test(arguments: [State.Observation.observing, .stopping, .stopped])
    func startOnceWatchingOrAfterIsIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        assert(makeState { $0.observation = observation }, .start, using: sut)
    }

    @Test func stopClosesTheSourcesAndKeepsTheNames() {
        let (sut, _) = makeSUT()
        let state = makeObservedState { $0.observation = .observing; $0.rowNames = [1: "Anna"] }
        assert(state, .stop, using: sut, delivering: .stopObserving) { $0.observation = .stopping }
    }

    @Test(arguments: [State.Observation.idle, .stopping, .stopped])
    func stopWhenNotWatchingIsIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        assert(makeState { $0.observation = observation }, .stop, using: sut)
    }

    @Test func closedSourcesEndTheObservation() {
        let (sut, _) = makeSUT()
        assert(makeState { $0.observation = .stopping }, .observationStopped, using: sut) { $0.observation = .stopped }
    }

    @Test(arguments: [State.Observation.idle, .observing, .stopped])
    func closedSourcesOutsideStoppingAreIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        assert(makeState { $0.observation = observation }, .observationStopped, using: sut)
    }
}
