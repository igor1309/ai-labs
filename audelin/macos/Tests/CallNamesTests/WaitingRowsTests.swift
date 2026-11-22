import CallNames
import CallObservation
import SpeakerNaming
import Testing

struct WaitingRowsTests {
    @Test func aRowThatCameBeforeAnyEvidenceTakesTheNameTheFirstEvidenceGives() {
        let (sut, spy) = makeSUT(stubs: [nil, "Anna"])
        let waiting = assert(makeState { $0.recordingStart = 100 }, .rows([makeRow()], now: 103), using: sut) {
            $0.waitingRows = [makeRow()]
        }
        assert(waiting, .zoom(.speaker("Anna"), at: 106), using: sut) {
            $0.lastZoomSpeaker = "Anna"; $0.roster = ["Anna"]; $0.knownNames = ["Anna"]
            $0.zoom.members = [.init(id: "Anna", name: "Anna")]
            $0.spoken = [.init(name: "Anna", start: 6, end: nil)]
            $0.zoom.intervals = [.init(memberID: "Anna", start: 6, end: nil)]
            $0.through = 6; $0.sequence = 3; $0.zoom.sequence = 3; $0.zoom.epoch = 1; $0.zoom.health = .healthy
            $0.zoom.through = 6
            $0.rowNames = [1: "Anna"]; $0.participantOrder = ["Anna"]; $0.participantIDs = ["Anna": "z1"]
            $0.waitingRows = []
        }
        #expect(spy.requests == [
            .init(start: 1, end: 5, roster: [], activities: [], through: 0),
            .init(start: 1, end: 5, roster: [.init(id: "Anna", name: "Anna", isLocal: false)],
                  activities: [.init(participantID: "Anna", start: 6, end: nil, uncertainty: AfterCallNames.uncertainty)], through: 6),
        ])
    }

    @Test func aRowPastWhatTheEvidenceKnowsIsLeftToTheAfterCallPass() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState { $0.waitingRows = [makeRow(end: 6)] }
        assert(state, .zoom(.speaker("Anna"), at: 107), using: sut) {
            $0.through = 7; $0.sequence = 4; $0.zoom.sequence = 4; $0.zoom.through = 7
            $0.waitingRows = []
        }
        #expect(spy.requests.count == 1)
    }

    @Test func aRowStillAheadOfTheEvidenceKeepsWaiting() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState { $0.waitingRows = [makeRow(end: 9)] }
        assert(state, .zoom(.speaker("Anna"), at: 107), using: sut) {
            $0.through = 7; $0.sequence = 4; $0.zoom.sequence = 4; $0.zoom.through = 7
        }
        #expect(spy.requests.count == 1)
    }

    @Test func aRowThatSealsWhileTheWatchWaitsForThePreviousCloseIsNamedByItsWatch() {
        let (sut, _) = makeSUT(stubs: [nil, "Anna"])
        var state = CallNamesModelState(calls: [1: .init(names: .init(observation: .stopping), watch: .init(sources: []))])
        for event: CallNamesEvent in [
            .start(2, .init(sources: [])),
            .update(2, .recordingChanged(isOn: true, at: 100)),
            .update(2, .rows([makeRow()], now: 103)),
            .observationStopped(1),
            .update(2, .zoom(.speaker("Anna"), at: 106)),
        ] {
            state = sut.reduce(state, event).0
        }
        #expect(state.calls[2]?.names.observation == .observing)
        #expect(state.calls[2]?.names.rowNames == [1: "Anna"])
        #expect(state.calls[2]?.names.waitingRows == [])
    }
}
