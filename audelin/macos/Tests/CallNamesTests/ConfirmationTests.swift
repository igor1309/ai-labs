import CallNames
import SpeakerNaming
import Testing

struct ConfirmationTests {

    private let turns = [DiarizedTurn(speaker: 0, start: 1, end: 5)]
    private let rows = [makeRow(1), makeRow(2, start: 6, end: 9)]

    @Test func constructionDoesNotConfirm() {
        let (_, _, confirm) = makeConfirmingSUT()
        #expect(confirm.requests.isEmpty)
    }

    @Test func confirmedNamesReplaceLiveOnesAndNewNamesGetTheNextIDsInNameOrder() {
        let (sut, naming, confirm) = makeConfirmingSUT(confirmed: [1: "Vera", 2: "Boris"])
        let state = makeObservedState {
            $0.rowNames = [1: "Anna", 3: "Anna"]; $0.participantIDs = ["Anna": "z1"]; $0.participantOrder = ["Anna"]
        }
        assert(state, .diarized(turns, rows: rows), using: sut) {
            $0.rowNames = [1: "Vera", 2: "Boris"]
            $0.participantIDs = ["Anna": "z1", "Boris": "z2", "Vera": "z3"]
            $0.participantOrder = ["Anna", "Boris", "Vera"]
            $0.confirmed = true
        }
        #expect(confirm.requests == [.init(rows: rows, turns: turns, evidence: .init(
            roster: ["Anna"], spoken: [.init(name: "Anna", start: 1, end: nil)], through: 5))])
        #expect(naming.requests.isEmpty)
    }

    @Test func aNameAlreadyGivenKeepsItsID() {
        let (sut, _, _) = makeConfirmingSUT(confirmed: [2: "Anna"])
        let state = makeObservedState { $0.rowNames = [1: "Anna"]; $0.participantIDs = ["Anna": "z1"]; $0.participantOrder = ["Anna"] }
        assert(state, .diarized(turns, rows: rows), using: sut) {
            $0.rowNames = [2: "Anna"]; $0.confirmed = true
        }
    }

    @Test func noTurnsLeaveNamesTentative() {
        let (sut, _, confirm) = makeConfirmingSUT(confirmed: [1: "Vera"])
        assert(makeObservedState(), .diarized([], rows: rows), using: sut)
        #expect(confirm.requests.isEmpty)
    }

    @Test func noCallAppEvidenceLeavesNamesTentative() {
        let (sut, _, confirm) = makeConfirmingSUT(confirmed: [1: "Vera"])
        assert(makeState(), .diarized(turns, rows: rows), using: sut)
        #expect(confirm.requests.isEmpty)
    }
}
