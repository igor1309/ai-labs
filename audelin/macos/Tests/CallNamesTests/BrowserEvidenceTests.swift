import CallNames
import CallObservation
import Testing

struct BrowserEvidenceTests {
    @Test func rosterAndSpeakingUpdateBrowserEvidenceAndPublishedValues() {
        let (sut, spy) = makeSUT()
        let members = [Member(id: "tile", name: "Boris"), Member(id: "self", name: "Me", isLocal: true)]
        let roster = assert(makeObservedState(), .browser(.init(epoch: 4, sequence: 1, time: 2, kind: .roster(members))), using: sut) {
            $0.browser.members = members
            $0.browser.epoch = 4; $0.browser.sequence = 1; $0.browser.through = 2; $0.browser.health = .healthy
            $0.roster = ["Boris"]; $0.spoken = []; $0.through = 2
        }
        let speaking = assert(roster, .browser(.init(epoch: 4, sequence: 2, time: 3, kind: .speaking(memberID: "tile", true))), using: sut) {
            $0.browser.intervals = [.init(memberID: "tile", start: 3, end: nil)]
            $0.browser.sequence = 2; $0.browser.through = 3
            $0.spoken = [.init(name: "Boris", start: 3, end: nil)]; $0.through = 3
        }
        assert(speaking, .browser(.init(epoch: 4, sequence: 3, time: 7, kind: .speaking(memberID: "tile", false))), using: sut) {
            $0.browser.intervals[0].end = 7; $0.browser.sequence = 3; $0.browser.through = 7
            $0.spoken[0].end = 7; $0.through = 7
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func browserMembersWinForMatchingAndLocalMembersStayLocal() {
        let (sut, spy) = makeSUT(stubs: ["Browser answer"])
        assert(makeBrowserState(), .rows([makeRow()], now: 20), using: sut) {
            $0.rowNames[1] = "Browser answer"
            $0.participantIDs["Browser answer"] = "z1"; $0.participantOrder = ["Browser answer"]
        }
        #expect(spy.requests == [makeBrowserRequest()])
    }

    @Test func zoomUpdatesAndTicksKeepBrowserPublishedWhileRetainingZoomEvidence() {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState()
        let observed = assert(state, .zoom(.observed, at: 7), using: sut) {
            $0.sequence = 4; $0.zoom.sequence = 4; $0.zoom.through = 7
        }
        assert(observed, .tick(now: 11), using: sut) {
            $0.zoom.intervals[0].end = 7; $0.zoom.health = .stale
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func emptyBrowserRosterFallsBackToZoomForPublishedValuesAndMatching() {
        let (sut, spy) = makeSUT(stubs: ["Zoom answer"])
        let state = makeBrowserState { $0.browserConnections = [4] }
        let ended = assert(state, .browser(.init(epoch: 4, sequence: 4, time: 7, kind: .roster([]))), using: sut) {
            $0.browser.members = []; $0.browser.sequence = 4; $0.browser.through = 7
            $0.roster = ["Anna"]; $0.spoken = [.init(name: "Anna", start: 1, end: nil)]; $0.through = 5
        }
        assert(ended, .rows([makeRow()], now: 20), using: sut) {
            $0.rowNames[1] = "Zoom answer"
            $0.participantIDs["Zoom answer"] = "z1"; $0.participantOrder = ["Zoom answer"]
        }
        #expect(spy.requests == [.init(
            start: 1, end: 5, roster: [.init(id: "Anna", name: "Anna")],
            activities: [.init(participantID: "Anna", start: 1, end: nil, uncertainty: 0.5)], through: 5
        )])
    }

    @Test(arguments: [Set<Int>(), [4], [4, 5]])
    func onlyOpenBrowserConnectionsRaiseThroughAtNaming(connections: Set<Int>) {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState { $0.browserConnections = connections }
        let through: Double = connections.isEmpty ? 6 : 20
        assert(state, .rows([makeRow()], now: 20), using: sut) { $0.through = through }
        #expect(spy.requests == [makeBrowserRequest(through: through)])
    }

    @Test func nowCannotLowerBrowserKnowledge() {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState { $0.browserConnections = [4] }
        assert(state, .rows([makeRow()], now: 3), using: sut)
        #expect(spy.requests == [makeBrowserRequest()])
    }

    @Test func connectionsAreASetAndOnlyTheLastDisconnectStopsSilenceKnowledge() {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState()
        let connected = assert(state, .browserConnected(4), using: sut) { $0.browserConnections = [4] }
        assert(connected, .browserConnected(4), using: sut)
        let two = assert(connected, .browserConnected(5), using: sut) { $0.browserConnections = [4, 5] }
        let one = assert(two, .browserDisconnected(4), using: sut) { $0.browserConnections = [5] }
        assert(one, .rows([makeRow()], now: 20), using: sut) { $0.through = 20 }
        let closed = assert(one, .browserDisconnected(5), using: sut) { $0.browserConnections = [] }
        assert(closed, .rows([makeRow()], now: 20), using: sut)
        #expect(spy.requests == [makeBrowserRequest(through: 20), makeBrowserRequest()])
    }

    @Test func unknownDisconnectAndOlderEpochLeaveEvenRaisedThroughUntouched() {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState { $0.browserConnections = [4]; $0.through = 20 }
        assert(state, .browserDisconnected(99), using: sut)
        assert(state, .browser(.init(epoch: 3, sequence: 100, time: 30, kind: .roster([]))), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test func namingWatermarkDoesNotRejectALaterBrowserObservation() {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState { $0.browserConnections = [4] }
        let named = assert(state, .rows([makeRow()], now: 20), using: sut) { $0.through = 20 }
        assert(named, .browser(.init(epoch: 4, sequence: 4, time: 7, kind: .speaking(memberID: "remote", false))), using: sut) {
            $0.browser.intervals[0].end = 7; $0.browser.sequence = 4; $0.browser.through = 7
            $0.spoken[0].end = 7; $0.through = 7
        }
        #expect(spy.requests == [makeBrowserRequest(through: 20)])
    }

    @Test func aTickWithoutNewZoomEvidenceKeepsThePublishedBrowserWatermark() {
        let (sut, spy) = makeSUT()
        let state = makeBrowserState { $0.browserConnections = [4]; $0.through = 20 }
        assert(state, .tick(now: 7), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test func aLocalOnlyBrowserRosterStillWinsOverZoom() {
        let (sut, spy) = makeSUT()
        let local = Member(id: "self", name: "Me", isLocal: true)
        let state = assert(makeObservedState(), .browser(.init(epoch: 4, sequence: 1, time: 2, kind: .roster([local]))), using: sut) {
            $0.browser.members = [local]
            $0.browser.epoch = 4; $0.browser.sequence = 1; $0.browser.through = 2; $0.browser.health = .healthy
            $0.roster = []; $0.spoken = []; $0.through = 2
        }
        assert(state, .rows([makeRow()], now: 20), using: sut)
        #expect(spy.requests == [.init(start: 1, end: 5,
                                      roster: [.init(id: "self", name: "Me", isLocal: true)],
                                      activities: [], through: 2)])
    }

    @Test func aNewEpochClosesOldActivityAndAcceptsARestartedSequence() {
        let (sut, spy) = makeSUT()
        assert(makeBrowserState(), .browser(.init(epoch: 5, sequence: 1, time: 8, kind: .roster([.init(id: "new", name: "Clara")]))), using: sut) {
            $0.browser.members = [.init(id: "new", name: "Clara")]
            $0.browser.intervals[0].end = 6; $0.browser.epoch = 5; $0.browser.sequence = 1; $0.browser.through = 8
            $0.roster = ["Clara"]; $0.spoken[0].end = 6; $0.spoken[0].name = "remote"; $0.spoken[1].name = "self"; $0.through = 8
        }
        #expect(spy.requests.isEmpty)
    }
}
