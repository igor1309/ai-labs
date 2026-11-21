import CallNames
import Testing

struct ObservationTests {

    @Test func startWatchesTheCallApp() {
        let (sut, _) = makeSUT()
        let watch = CallAppWatch(sources: [])
        assert(CallNamesModelState(), .start(1, watch), using: sut, delivering: .observe(1, watch)) {
            $0.calls[1] = .init(names: makeState { $0.observation = .observing }, watch: watch)
        }
    }

    @Test func firstRecordingOnStartsTheClock() {
        let (sut, _) = makeSUT()
        let state = makeState { $0.observation = .observing }
        let recording = assert(state, .recordingChanged(isOn: true, at: 100), using: sut) {
            $0.recordingStart = 100
        }
        assert(recording, .recordingChanged(isOn: true, at: 105), using: sut)
    }

    @Test func recordingOffClearsTheClockAndKeepsEvidenceAndNames() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState { $0.rowNames = [1: "Anna"] }
        let off = assert(state, .recordingChanged(isOn: false, at: 110), using: sut) {
            $0.recordingStart = nil
        }
        assert(off, .rows([makeRow(2)], now: 112), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test(arguments: [State.Observation.observing, .stopping, .stopped])
    func startOnceWatchingOrAfterIsIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        let state = makeModel(makeState { $0.observation = observation })
        assert(state, .start(1, .init(sources: [])), using: sut)
    }

    @Test func stopClosesTheSourcesAndKeepsTheNames() {
        let (sut, _) = makeSUT()
        let watch = CallAppWatch(sources: [])
        let state = makeModel(makeObservedState { $0.observation = .observing; $0.rowNames = [1: "Anna"] }, watch: watch)
        assert(state, .stop(1), using: sut, delivering: .stopObserving(1, watch)) {
            $0.calls[1]?.names.observation = .stopping
        }
    }

    @Test(arguments: [State.Observation.idle, .stopping, .stopped])
    func stopWhenNotWatchingIsIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        assert(makeModel(makeState { $0.observation = observation }), .stop(1), using: sut)
    }

    @Test func closedSourcesEndTheObservation() {
        let (sut, _) = makeSUT()
        assert(makeModel(makeState { $0.observation = .stopping }), .observationStopped(1), using: sut) {
            $0.calls[1]?.names.observation = .stopped
        }
    }

    @Test(arguments: [State.Observation.idle, .observing, .stopped])
    func closedSourcesOutsideStoppingAreIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        assert(makeModel(makeState { $0.observation = observation }), .observationStopped(1), using: sut)
    }
}
