import CallNames
import CallObservation
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

    @Test func recordingOffClosesTheWindowAndKeepsEvidenceAndNames() {
        let (sut, spy) = makeSUT()
        let state = makeObservedState { $0.rowNames = [1: "Anna"] }
        let off = assert(state, .recordingChanged(isOn: false, at: 110), using: sut) {
            $0.recordingEnd = 110
        }
        assert(off, .rows([makeRow(2)], now: 112), using: sut)
        #expect(spy.requests.isEmpty)
    }

    @Test func zoomEvidenceBeginsWithTheFirstPollInTheRecordingWindow() {
        let (sut, spy) = makeSUT()
        let watching = makeState { $0.observation = .observing }
        assert(watching, .zoom(.speaker("Anna"), at: 99), using: sut)
        assert(watching, .tick(now: 99), using: sut)
        let recording = assert(watching, .recordingChanged(isOn: true, at: 100), using: sut) {
            $0.recordingStart = 100
        }
        assert(recording, .zoom(.speaker("Anna"), at: 99.5), using: sut)
        assert(recording, .zoom(.speaker("Anna"), at: 101), using: sut) {
            $0.lastZoomSpeaker = "Anna"; $0.knownNames = ["Anna"]; $0.sequence = 3
            $0.zoom = .init(members: [.init(id: "Anna", name: "Anna")],
                            intervals: [.init(memberID: "Anna", start: 1, end: nil)],
                            through: 1, epoch: 1, sequence: 3, health: .healthy)
            $0.roster = ["Anna"]; $0.spoken = [.init(name: "Anna", start: 1, end: nil)]; $0.through = 1
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func delayedZoomPollsAndTicksCountOnlyInsideTheRecordingWindow() {
        let (sut, spy) = makeSUT()
        let recording = makeObservedState()
        let ended = assert(recording, .recordingChanged(isOn: false, at: 110), using: sut) {
            $0.recordingEnd = 110
        }
        let delayed = assert(ended, .zoom(.speaker("Anna"), at: 106), using: sut) {
            $0.through = 6; $0.sequence = 4; $0.zoom.sequence = 4; $0.zoom.through = 6
        }
        assert(delayed, .zoom(.nobody, at: 110), using: sut)
        assert(delayed, .tick(now: 111), using: sut)
        assert(delayed, .tick(now: 109.5), using: sut) {
            $0.zoom.health = .stale; $0.zoom.intervals[0].end = 6; $0.spoken[0].end = 6
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func earlyBrowserRosterAndSpeakingArePlacedInOrderWhenRecordingStarts() {
        let (sut, spy) = makeSUT(stubs: ["Anna"])
        let member = Member(id: "tile", name: "Anna")
        let roster = Event(epoch: 4, sequence: 1, time: 98, kind: .roster([member]))
        let speaking = Event(epoch: 4, sequence: 2, time: 99, kind: .speaking(memberID: "tile", true))
        let stopped = Event(epoch: 4, sequence: 3, time: 103, kind: .speaking(memberID: "tile", false))
        let connected = assert(makeState(), .browserConnected(4), using: sut) { $0.browserConnections = [4] }
        let withRoster = assert(connected, .browser(roster, receivedAt: 98.5), using: sut) { $0.heldBrowserMessages = [roster] }
        let withSpeaker = assert(withRoster, .browser(speaking, receivedAt: 99.5), using: sut) { $0.heldBrowserMessages.append(speaking) }
        let held = assert(withSpeaker, .browser(stopped, receivedAt: 103.5), using: sut) { $0.heldBrowserMessages.append(stopped) }
        #expect(spy.requests.isEmpty)

        let recording = assert(held, .recordingChanged(isOn: true, at: 100), using: sut) {
            $0.recordingStart = 100; $0.heldBrowserMessages = []
            $0.browser = .init(members: [member], intervals: [.init(memberID: "tile", start: 0, end: 3)],
                               through: 3, epoch: 4, sequence: 3, health: .healthy)
            $0.roster = ["Anna"]; $0.spoken = [.init(name: "Anna", start: 0, end: 3)]; $0.through = 3
        }
        assert(recording, .rows([makeRow(start: 0, end: 3)], now: 104), using: sut) {
            $0.through = 4; $0.rowNames = [1: "Anna"]; $0.participantIDs = ["Anna": "z1"]; $0.participantOrder = ["Anna"]
        }
        #expect(spy.requests == [.init(
            start: 0, end: 3, roster: [.init(id: "tile", name: "Anna")],
            activities: [.init(participantID: "tile", start: 0, end: 3, uncertainty: 0.5)], through: 4
        )])
    }

    @Test(arguments: [false, true])
    func anEarlyRosterCannotHideSpeakingAfterRecalibration(rosterReportedAfterStart: Bool) {
        let (sut, spy) = makeSUT(stubs: ["Anna"])
        let start = 105.05
        let speakingTime = 105.10
        let member = Member(id: "tile", name: "Anna")
        let roster = Event(epoch: 4, sequence: 1, time: 105.15, kind: .roster([member]))
        let report = CallNamesUpdate.browser(roster, receivedAt: 104.96)
        let recording = CallNamesUpdate.recordingChanged(isOn: true, at: start)
        let watching = makeState { $0.observation = .observing; $0.browserConnections = [4] }
        let withRoster: State
        if rosterReportedAfterStart {
            let started = assert(watching, recording, using: sut) { $0.recordingStart = start }
            withRoster = assert(started, report, using: sut) {
                $0.browser = .init(members: [member], epoch: 4, sequence: 1, health: .healthy)
                $0.roster = ["Anna"]
            }
        } else {
            let held = assert(watching, report, using: sut) {
                var message = roster
                message.time = 104.96
                $0.heldBrowserMessages = [message]
            }
            withRoster = assert(held, recording, using: sut) {
                $0.recordingStart = start; $0.heldBrowserMessages = []
                $0.browser = .init(members: [member], epoch: 4, sequence: 1, health: .healthy)
                $0.roster = ["Anna"]
            }
        }
        #expect(spy.requests.isEmpty)

        let speaking = Event(epoch: 4, sequence: 2, time: speakingTime, kind: .speaking(memberID: "tile", true))
        let speakingStart = speakingTime - start
        let observed = assert(withRoster, .browser(speaking, receivedAt: speakingTime), using: sut) {
            $0.browser.intervals = [.init(memberID: "tile", start: speakingStart, end: nil)]
            $0.browser.sequence = 2; $0.browser.through = speakingStart
            $0.spoken = [.init(name: "Anna", start: speakingStart, end: nil)]; $0.through = speakingStart
        }
        #expect(spy.requests.isEmpty)

        let row = makeRow(start: speakingStart, end: 1)
        let now = 107.0
        assert(observed, .rows([row], now: now), using: sut) {
            $0.through = now - start; $0.rowNames = [1: "Anna"]
            $0.participantIDs = ["Anna": "z1"]; $0.participantOrder = ["Anna"]
        }
        #expect(spy.requests == [.init(
            start: row.start, end: row.end, roster: [.init(id: "tile", name: "Anna")],
            activities: [.init(participantID: "tile", start: speakingStart, end: nil, uncertainty: 0.5)], through: now - start
        )])
    }

    @Test func aFullBrowserConnectionEvictsOnlyItsOwnOldestHeldMessage() {
        let (sut, spy) = makeSUT()
        let waiting = (1...1000).map { Event(epoch: 4, sequence: $0, time: 98, kind: .heartbeat) }
        let other = Event(epoch: 5, sequence: 1, time: 98, kind: .roster([]))
        let state = makeState {
            $0.browserConnections = [4, 5]
            $0.heldBrowserMessages = [other] + waiting
        }
        let newest = Event(epoch: 4, sequence: 1001, time: 99, kind: .heartbeat)

        assert(state, .browser(newest, receivedAt: 99), using: sut) {
            $0.heldBrowserMessages = [other] + Array(waiting.dropFirst()) + [newest]
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func browserDisconnectBeforeRecordingDropsOnlyThatConnectionsMessages() {
        let (sut, spy) = makeSUT()
        let departed = Event(epoch: 5, sequence: 1, time: 98, kind: .roster([.init(id: "tile", name: "Anna")]))
        let other = Event(epoch: 4, sequence: 1, time: 99, kind: .roster([]))
        let watching = makeState { $0.browserConnections = [4, 5]; $0.heldBrowserMessages = [departed, other] }
        let disconnected = assert(watching, .browserDisconnected(5), using: sut) {
            $0.browserConnections = [4]; $0.heldBrowserMessages = [other]
        }
        let recording = assert(disconnected, .recordingChanged(isOn: true, at: 100), using: sut) {
            $0.recordingStart = 100; $0.heldBrowserMessages = []
            $0.browser = .init(epoch: 4, sequence: 1, health: .healthy)
        }
        assert(recording, .rows([makeRow()], now: 105), using: sut) { $0.waitingRows = [makeRow()] }
        #expect(spy.requests == [.init(start: 1, end: 5, roster: [], activities: [], through: 0)])
    }

    @Test func browserMessagesArrivingAfterRecordingAreHeldAndNeverPlaced() {
        let (sut, spy) = makeSUT()
        let ended = makeBrowserState { $0.recordingEnd = 110; $0.browserConnections = [4] }
        let message = Event(epoch: 4, sequence: 4, time: 109, kind: .roster([]))
        let held = assert(ended, .browser(message, receivedAt: 111), using: sut) { $0.heldBrowserMessages = [message] }
        assert(held, .recordingChanged(isOn: true, at: 115), using: sut)
        assert(held, .browserDisconnected(4), using: sut) {
            $0.browserConnections = []; $0.heldBrowserMessages = []
        }
        #expect(spy.requests.isEmpty)
    }

    @Test(arguments: [State.Observation.pending, .observing, .stopping, .stopped])
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
        var state = makeModel(makeState { $0.observation = .stopping })
        state.calls[1]?.reportsEnded = true
        assert(state, .observationStopped(1), using: sut) {
            $0.calls[1]?.names.observation = .stopped
            $0.calls[1]?.sourcesClosed = true
        }
    }

    @Test(arguments: [State.Observation.idle, .observing, .stopped])
    func closedSourcesOutsideStoppingAreIgnored(observation: State.Observation) {
        let (sut, _) = makeSUT()
        assert(makeModel(makeState { $0.observation = observation }), .observationStopped(1), using: sut)
    }
}
