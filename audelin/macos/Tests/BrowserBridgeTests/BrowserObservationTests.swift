import BrowserBridge
import CallObservation
import Testing

@Suite struct BrowserObservationTests {
    private let anna = BrowserParticipant(id: "tile-1", name: "Анна", isSelf: false)
    private let boris = BrowserParticipant(id: "tile-2", name: "Boris", isSelf: false)
    private let me = BrowserParticipant(id: "tile-3", name: "Me", isSelf: true)

    @Test func mapsTheRosterWithTheLocalParticipant() {
        let snapshot = observe([.roster(at: 1_000_000, participants: [anna, me])])
        #expect(snapshot.members == [Member(id: "tile-1", name: "Анна"), Member(id: "tile-3", name: "Me", isLocal: true)])
        #expect(snapshot.through == 10)
    }

    @Test func turnsStartAndStopIntoAnInterval() {
        let snapshot = observe([
            .roster(at: 1_000_000, participants: [anna]),
            .speakingStarted(at: 1_002_000, participantID: "tile-1"),
            .speakingStopped(at: 1_005_500, participantID: "tile-1"),
        ])
        #expect(snapshot.intervals == [Interval(memberID: "tile-1", start: 12, end: 15.5)])
    }

    @Test func keepsOverlappingSpeakersApart() {
        let snapshot = observe([
            .roster(at: 1_000_000, participants: [anna, boris]),
            .speakingStarted(at: 1_001_000, participantID: "tile-1"),
            .speakingStarted(at: 1_002_000, participantID: "tile-2"),
            .speakingStopped(at: 1_003_000, participantID: "tile-1"),
            .speakingStopped(at: 1_004_000, participantID: "tile-2"),
        ])
        #expect(snapshot.intervals == [
            Interval(memberID: "tile-1", start: 11, end: 13),
            Interval(memberID: "tile-2", start: 12, end: 14),
        ])
    }

    @Test func aRenamedParticipantSpeaksUnderTheirNewTile() {
        let renamed = BrowserParticipant(id: "tile-4", name: "Anna Petrova", isSelf: false)
        let snapshot = observe([
            .roster(at: 1_000_000, participants: [anna]),
            .speakingStarted(at: 1_001_000, participantID: "tile-1"),
            .speakingStopped(at: 1_002_000, participantID: "tile-1"),
            .roster(at: 1_003_000, participants: [renamed]),
            .speakingStarted(at: 1_004_000, participantID: "tile-4"),
            .speakingStopped(at: 1_005_000, participantID: "tile-4"),
        ])
        #expect(snapshot.members == [Member(id: "tile-4", name: "Anna Petrova")])
        #expect(snapshot.intervals == [
            Interval(memberID: "tile-1", start: 11, end: 12),
            Interval(memberID: "tile-4", start: 14, end: 15),
        ])
    }

    @Test func theCallsEndEmptiesTheRoster() {
        let snapshot = observe([.roster(at: 1_000_000, participants: [anna]), .callEnded(at: 1_009_000)])
        #expect(snapshot.members == [])
        #expect(snapshot.through == 19)
    }

    @Test func dropsAnEventItCannotPlaceOnTheCallClock() {
        let message = BrowserMessage(callID: "12345678901234", sequence: 0, event: .callEnded(at: 1))
        #expect(BrowserObservation.event(message, connection: 0, callTime: { _ in nil }) == nil)
    }

    @Test func aNewConnectionStartsANewEpoch() {
        var observation = CallObservation()
        let first = [BrowserEvent.roster(at: 1_000_000, participants: [anna]), .speakingStarted(at: 1_001_000, participantID: "tile-1"), .roster(at: 1_002_000, participants: [anna])]
        for (index, event) in first.enumerated() { receive(event, sequence: index + 5, connection: 0, into: &observation) }
        // The extension restarted: its numbering starts again on a new connection,
        // and speaking open on the old one ends where it was last known.
        receive(.roster(at: 1_003_000, participants: [anna]), sequence: 0, connection: 1, into: &observation)
        #expect(observation.snapshot.intervals == [Interval(memberID: "tile-1", start: 11, end: 12)])
        #expect(observation.snapshot.through == 13)
    }
}

/// Browser milliseconds are 990 s ahead of the call clock.
private func callTime(_ milliseconds: Double) -> Double? { milliseconds / 1000 - 990 }

private func observe(_ events: [BrowserEvent]) -> Snapshot {
    var observation = CallObservation()
    for (index, event) in events.enumerated() { receive(event, sequence: index, connection: 0, into: &observation) }
    return observation.snapshot
}

private func receive(_ event: BrowserEvent, sequence: Int, connection: Int, into observation: inout CallObservation) {
    let message = BrowserMessage(callID: "12345678901234", sequence: sequence, event: event)
    if let event = BrowserObservation.event(message, connection: connection, callTime: callTime) { observation.receive(event) }
}
