import CallNames
import SpeakerNaming
import Testing

struct CallNamesReducerTests {
    @Test func constructionDoesNotRequestAName() {
        let (_, spy) = makeSUT()
        #expect(spy.requests.isEmpty)
    }

    @Test func firstSightAddsRosterNamesInOrderAndOpensIntervals() {
        let (sut, spy) = makeSUT()
        let anna = assert(makeState(), .zoom(.started("Anna"), at: 1), using: sut) {
            $0.roster = ["Anna"]; $0.knownNames = ["Anna"]
            $0.spoken = [.init(name: "Anna", start: 1, end: nil)]
            $0.through = 1; $0.sequence = 2; $0.zoomSequence = 2; $0.zoomEpoch = 1; $0.zoomHealth = .healthy
        }
        let boris = assert(anna, .zoom(.started("Boris"), at: 2), using: sut) {
            $0.roster.append("Boris"); $0.knownNames.append("Boris")
            $0.spoken.append(.init(name: "Boris", start: 2, end: nil))
            $0.through = 2; $0.sequence = 4; $0.zoomSequence = 4
        }
        assert(boris, .zoom(.started("Anna"), at: 3), using: sut) {
            $0.through = 3; $0.sequence = 5; $0.zoomSequence = 5
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func stopClosesOnlyThatNameAndARepeatedStartOpensANewInterval() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState {
            $0.roster.append("Boris"); $0.knownNames.append("Boris")
            $0.spoken.append(.init(name: "Boris", start: 2, end: nil))
        }
        let stopped = assert(state, .zoom(.stopped("Anna"), at: 6), using: sut) {
            $0.spoken[0].end = 6; $0.through = 6; $0.sequence = 4; $0.zoomSequence = 4
        }
        assert(stopped, .zoom(.started("Anna"), at: 7), using: sut) {
            $0.spoken.append(.init(name: "Anna", start: 7, end: nil))
            $0.through = 7; $0.sequence = 5; $0.zoomSequence = 5
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func heartbeatAdvancesThroughWithoutClosingAnInterval() {
        let (sut, spy) = makeSUT()
        assert(makeObservedState(), .zoom(.observed, at: 7), using: sut) {
            $0.through = 7; $0.sequence = 4; $0.zoomSequence = 4
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func lostDoesNothing() {
        let (sut, spy) = makeSUT()
        assert(makeObservedState(), .zoom(.lost, at: 20), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test func tickClosesAtLastKnowledgeOnlyAfterTheTimeout() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState { $0.zoomTimeout = 2 }
        assert(state, .tick(now: 7), using: sut)
        let stale = assert(state, .tick(now: 8), using: sut) {
            $0.spoken[0].end = 5; $0.zoomHealth = .stale
        }
        assert(stale, .tick(now: 20), using: sut)
        assert(makeState(), .tick(now: 20), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test func staleTickRemovesAnIntervalWithoutKnownDuration() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState { $0.spoken[0].start = 5 }
        assert(state, .tick(now: 9), using: sut) {
            $0.spoken = []; $0.zoomHealth = .stale
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func lateChangesKeepTheSenderSequenceAndKnownNamesForTheNextRoster() {
        let (sut, spy) = makeSUT()
        let late = assert(makeObservedState(), .zoom(.started("Boris"), at: 4), using: sut) {
            $0.knownNames.append("Boris"); $0.sequence = 5
        }
        assert(late, .zoom(.started("Clara"), at: 6), using: sut) {
            $0.knownNames.append("Clara"); $0.roster = ["Anna", "Boris", "Clara"]
            $0.spoken[0].end = 5
            $0.spoken.append(.init(name: "Clara", start: 6, end: nil))
            $0.through = 6; $0.sequence = 7; $0.zoomSequence = 7
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func rowsPassExactEvidenceToNamingAndUseItsAnswer() {
        let (sut, spy) = makeSUT(stubs: ["Stub"])
        let state = makeObservedState {
            $0.roster.append("Boris"); $0.knownNames.append("Boris")
            $0.spoken.append(.init(name: "Boris", start: 0, end: 1))
        }
        assert(state, .rows([makeRow(12, start: 2, end: 4)]), using: sut) {
            $0.rowNames[12] = "Stub"
            $0.participantIDs["Stub"] = "z1"; $0.participantOrder = ["Stub"]
        }
        #expect(spy.requests == [.init(
            start: 2, end: 4, roster: [.init(id: "Anna", name: "Anna"), .init(id: "Boris", name: "Boris")],
            activities: [.init(participantID: "Anna", start: 1, end: nil, uncertainty: 0.5),
                         .init(participantID: "Boris", start: 0, end: 1, uncertainty: 0.5)], through: 5
        )])
    }

    @Test func idsFollowAscendingRowIDWithinABatchAndFirstSeenNamesAcrossBatches() {
        let (sut, spy) = makeSUT(stubs: ["Boris", "Anna", "Anna", "Boris"])
        let first = assert(makeObservedState(), .rows([makeRow(9, start: 9, end: 13), makeRow(3, start: 3, end: 7)]), using: sut) {
            $0.rowNames = [3: "Boris", 9: "Anna"]
            $0.participantIDs = ["Boris": "z1", "Anna": "z2"]; $0.participantOrder = ["Boris", "Anna"]
        }
        assert(first, .rows([makeRow(10, start: 10, end: 14), makeRow(1, start: 1)]), using: sut) {
            $0.rowNames[1] = "Anna"; $0.rowNames[10] = "Boris"
        }
        #expect(spy.requests.map(\.start) == [3, 9, 1, 10])
    }

    @Test func namedRowsNeverRequestAnotherNameEvenWithDifferentTimingOrEvidence() {
        let (sut, spy) = makeSUT(stubs: ["Anna", "Boris"])
        let named = assert(makeObservedState(), .rows([makeRow()]), using: sut) {
            $0.rowNames[1] = "Anna"; $0.participantIDs["Anna"] = "z1"; $0.participantOrder = ["Anna"]
        }
        var changed = named
        changed.roster = ["Boris"]; changed.spoken = [.init(name: "Boris", start: 5, end: 15)]; changed.through = 15
        assert(changed, .rows([makeRow(start: 5, end: 15)]), using: sut)
        #expect(spy.requests.count == 1)
    }

    @Test func unnamedRowsStayUnnamedAndCanBeRetriedWithLaterEvidence() {
        let (sut, spy) = makeSUT(stubs: [nil, "Anna"])
        let state = makeObservedState()
        assert(state, .rows([makeRow()]), using: sut)
        let later = assert(state, .zoom(.observed, at: 6), using: sut) {
            $0.through = 6; $0.sequence = 4; $0.zoomSequence = 4
        }
        assert(later, .rows([makeRow()]), using: sut) {
            $0.rowNames[1] = "Anna"; $0.participantIDs["Anna"] = "z1"; $0.participantOrder = ["Anna"]
        }
        #expect(spy.requests.map(\.through) == [5, 6])
    }

    @Test func batchesWithNoNewRowsLeaveStateAndNamingUntouched() {
        let (sut, spy) = makeSUT(stubs: ["Boris"])
        let state = makeObservedState {
            $0.rowNames[1] = "Anna"; $0.participantIDs["Anna"] = "z1"; $0.participantOrder = ["Anna"]
        }
        assert(state, .rows([]), using: sut)
        assert(state, .rows([makeRow(), makeRow()]), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test func duplicateRowsUseTheirFirstGivenName() {
        let (sut, spy) = makeSUT(stubs: ["Anna", "Boris"])
        assert(makeObservedState(), .rows([makeRow(), makeRow()]), using: sut) {
            $0.rowNames[1] = "Anna"; $0.participantIDs["Anna"] = "z1"; $0.participantOrder = ["Anna"]
        }
        #expect(spy.requests.count == 1)
    }
}
