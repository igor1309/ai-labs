import CallObservation
import Testing

@Suite struct CallObservationTests {
    @Test func speakingBecomesIntervalsWithinTheRoster() {
        var observation = CallObservation()
        feed(&observation, [(0, .roster([Member(id: "a", name: "Anna")])), (1, .speaking(memberID: "a", true)), (4, .speaking(memberID: "a", false))])
        #expect(observation.snapshot.intervals == [.init(memberID: "a", start: 1, end: 4)])
        #expect(observation.snapshot.members.map(\.name) == ["Anna"])
        #expect(observation.snapshot.through == 4)
        #expect(observation.snapshot.health == .healthy)
    }
    @Test func openIntervalStaysOpenUntilStopped() {
        var observation = CallObservation()
        feed(&observation, [(1, .speaking(memberID: "a", true)), (2, .heartbeat)])
        #expect(observation.snapshot.intervals == [.init(memberID: "a", start: 1, end: nil)])
        #expect(observation.snapshot.through == 2)
    }
    @Test func lostStopIsClosedAtTheGap() {
        var observation = CallObservation()
        observation.receive(.init(epoch: 1, sequence: 1, time: 1, kind: .speaking(memberID: "a", true)))
        observation.receive(.init(epoch: 1, sequence: 2, time: 3, kind: .heartbeat))
        observation.receive(.init(epoch: 1, sequence: 5, time: 9, kind: .heartbeat))
        #expect(observation.snapshot.intervals == [.init(memberID: "a", start: 1, end: 3)])
    }
    @Test func silenceMakesTheSourceStaleAndClosesSpeaking() {
        var observation = CallObservation(timeout: 3)
        feed(&observation, [(1, .speaking(memberID: "a", true))])
        observation.tick(now: 3)
        #expect(observation.snapshot.health == .healthy)
        observation.tick(now: 10)
        #expect(observation.snapshot.health == .stale)
        #expect(observation.snapshot.intervals.isEmpty)
    }
    @Test func replayedAndLateEventsAreIgnored() {
        var observation = CallObservation()
        let start = Event(epoch: 1, sequence: 1, time: 1, kind: .speaking(memberID: "a", true))
        observation.receive(start)
        observation.receive(.init(epoch: 1, sequence: 2, time: 4, kind: .speaking(memberID: "a", false)))
        observation.receive(start)
        observation.receive(.init(epoch: 0, sequence: 9, time: 9, kind: .speaking(memberID: "b", true)))
        #expect(observation.snapshot.intervals == [.init(memberID: "a", start: 1, end: 4)])
    }
    @Test func newEpochClosesWhatWasOpen() {
        var observation = CallObservation()
        observation.receive(.init(epoch: 1, sequence: 1, time: 1, kind: .speaking(memberID: "a", true)))
        observation.receive(.init(epoch: 1, sequence: 2, time: 2, kind: .heartbeat))
        observation.receive(.init(epoch: 2, sequence: 1, time: 5, kind: .heartbeat))
        #expect(observation.snapshot.intervals == [.init(memberID: "a", start: 1, end: 2)])
        #expect(observation.snapshot.through == 5)
    }

    private func feed(_ observation: inout CallObservation, _ events: [(Double, Event.Kind)]) {
        for (index, event) in events.enumerated() { observation.receive(.init(epoch: 1, sequence: index + 1, time: event.0, kind: event.1)) }
    }
}
