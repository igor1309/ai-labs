import CallNames
import SpeakerNaming
import Testing

struct CallLifetimeTests {
    @Test(arguments: [false, true])
    func theNextWatchWaitsForThePreviousClose(released: Bool) {
        let (sut, _) = makeSUT()
        let watch = CallAppWatch(sources: [])
        let stopping = makeStopping(released: released)
        let pending = assert(stopping, .start(2, watch), using: sut) {
            $0.calls[2] = .init(names: .init(observation: .pending), watch: watch)
        }
        assert(pending, .observationStopped(3), using: sut)
        assert(pending, .observationStopped(1), using: sut, delivering: .observe(2, watch)) {
            $0.calls[1]?.names.observation = .stopped
            $0.calls[1]?.sourcesClosed = true
            $0.stoppingWatches.remove(1)
            $0.calls[2]?.names.observation = .observing
        }
    }

    @Test func anEndedPendingWatchIsSkippedWhenThePreviousWatchCloses() {
        let (sut, _) = makeSUT()
        let watch = CallAppWatch(sources: [])
        let pending = makeStopping(released: true) {
            $0.calls[2] = .init(names: .init(observation: .pending), watch: .init(sources: []))
            $0.calls[3] = .init(names: .init(observation: .pending), watch: watch)
        }
        let ended = assert(pending, .sessionEnded(2, hasTranscript: true), using: sut) {
            $0.calls[2]?.names.observation = .stopped
        }
        assert(ended, .observationStopped(1), using: sut, delivering: .observe(3, watch)) {
            $0.stoppingWatches.remove(1)
            $0.calls[3]?.names.observation = .observing
        }
    }

    @Test func finishedCallIsConfirmedWhileTheNextRecordsWithTheSameRowID() {
        let (sut, _, confirm) = makeConfirmingSUT(confirmed: [1: "Confirmed"])
        let state = makeCalls(first: .stopped)
        let rows = [makeRow()]
        let turns = [DiarizedTurn(speaker: 0, start: 1, end: 5)]
        assert(state, .update(1, .diarized(turns, rows: rows)), using: sut) {
            $0.calls[1]?.names.rowNames = [1: "Confirmed"]
            $0.calls[1]?.names.participantIDs = ["Anna": "z1", "Confirmed": "z2"]
            $0.calls[1]?.names.participantOrder = ["Anna", "Confirmed"]
            $0.calls[1]?.names.confirmed = true
        }
        #expect(confirm.requests == [.init(rows: rows, turns: turns, evidence: .init(
            roster: ["Anna"], spoken: [.init(name: "Anna", start: 1, end: nil)], through: 5))])
    }

    @Test func endingOneWatchLeavesTheOtherCallNamingItsRows() throws {
        let (sut, spy) = makeSUT(stubs: ["Anna"])
        let state = makeCalls(first: .observing, second: .pending)
        let watch = try #require(state.calls[1]?.watch)
        let nextWatch = try #require(state.calls[2]?.watch)
        let stopping = assert(state, .stop(1), using: sut, delivering: .stopObserving(1, watch)) {
            $0.calls[1]?.names.observation = .stopping
        }
        let stopped = assert(stopping, .observationStopped(1), using: sut, delivering: .observe(2, nextWatch)) {
            $0.calls[1]?.names.observation = .stopped
            $0.calls[1]?.sourcesClosed = true
            $0.calls[2]?.names.observation = .observing
        }
        assert(stopped, .update(2, .rows([makeRow(2)], now: 205)), using: sut) {
            $0.calls[2]?.names.rowNames[2] = "Anna"
            $0.calls[2]?.names.participantIDs["Anna"] = "z2"
            $0.calls[2]?.names.participantOrder.append("Anna")
        }
        #expect(spy.requests == [.init(
            start: 1, end: 5, roster: [.init(id: "Anna", name: "Anna")],
            activities: [.init(participantID: "Anna", start: 1, end: nil, uncertainty: 0.5)], through: 5)])
    }

    @Test func sessionEndKeepsNamesOnlyIfATranscriptOpened() throws {
        let (sut, _) = makeSUT()
        let state = makeCalls(first: .observing)
        let watch = try #require(state.calls[1]?.watch)
        assert(state, .sessionEnded(1, hasTranscript: true), using: sut, delivering: .stopObserving(1, watch)) {
            $0.calls[1]?.names.observation = .stopping
        }
        assert(state, .sessionEnded(1, hasTranscript: false), using: sut, delivering: .stopObserving(1, watch)) {
            $0.calls[1] = nil
            $0.stoppingWatches.insert(1)
        }
    }

    @Test func finalizedCallIsReleasedAndLateTurnsAreIgnored() {
        let (sut, spy, confirm) = makeConfirmingSUT(confirmed: [1: "Confirmed"])
        let state = makeCalls(first: .stopped)
        let released = assert(state, .finalized(1), using: sut) {
            $0.calls[1] = nil
        }
        assert(released, .update(1, .diarized([.init(speaker: 0, start: 1, end: 5)], rows: [makeRow()])), using: sut)
        assert(released, .update(1, .rows([makeRow()], now: 205)), using: sut)
        assert(released, .observationStopped(1), using: sut)
        #expect(confirm.requests.isEmpty && spy.requests.isEmpty)
    }

    @Test(arguments: [State.Observation.observing, .stopping])
    func finalizationReleasesNamesBeforeTheWatchAcknowledgesItsStop(observation: State.Observation) throws {
        let (sut, _, confirm) = makeConfirmingSUT(confirmed: [1: "Confirmed"])
        let state = makeCalls(first: observation)
        let watch = try #require(state.calls[1]?.watch)
        let stop: CallNamesEffect? = observation == .observing ? .stopObserving(1, watch) : nil
        let released = assert(state, .finalized(1), using: sut, delivering: stop) {
            $0.calls[1] = nil
            $0.stoppingWatches.insert(1)
        }
        assert(released, .update(1, .diarized([.init(speaker: 0, start: 1, end: 5)], rows: [makeRow()])), using: sut)
        assert(released, .observationStopped(1), using: sut) {
            $0.stoppingWatches.remove(1)
        }
        #expect(confirm.requests.isEmpty)
    }

    private func makeCalls(first: State.Observation, second: State.Observation = .observing) -> CallNamesModelState {
        .init(calls: [
            1: .init(names: makeObservedState {
                $0.observation = first
                $0.recordingStart = first == .observing ? 100 : nil
                $0.rowNames = [1: "Anna"]; $0.participantIDs = ["Anna": "z1"]; $0.participantOrder = ["Anna"]
            }, watch: .init(sources: []), reportsEnded: true),
            2: .init(names: makeObservedState {
                $0.observation = second; $0.recordingStart = 200
                $0.rowNames = [1: "Boris"]; $0.participantIDs = ["Boris": "z1"]; $0.participantOrder = ["Boris"]
            }, watch: .init(sources: [])),
        ])
    }

    private func makeStopping(
        released: Bool, _ change: (inout CallNamesModelState) -> Void = { _ in }
    ) -> CallNamesModelState {
        var state = released
            ? CallNamesModelState(stoppingWatches: [1])
            : CallNamesModelState(calls: [1: .init(names: .init(observation: .stopping), watch: .init(sources: []), reportsEnded: true)])
        change(&state)
        return state
    }
}
