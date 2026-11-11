import SpeakerNaming
import Testing

@Suite struct SpeakerNamingTests {
    let roster = [Participant(id: "me", name: "Igor", isLocal: true), Participant(id: "a", name: "Anna"), Participant(id: "b", name: "Boris")]

    @Test func twoRemoteSpeakersAreNamedFromAlternatingTurns() {
        var naming = timeline([("a", 0, 3), ("b", 3, 6), ("a", 6, 9), ("b", 9, 12)], turns: [("s1", 0, 3), ("s2", 3, 6), ("s1", 6, 9), ("s2", 9, 12)])
        naming.advance()
        #expect(naming.name(of: "s1") == "Anna")
        #expect(naming.name(of: "s2") == "Boris")
    }
    @Test func oneTurnIsOnlyACandidateAndShowsNoName() {
        var naming = timeline([("a", 0, 3)], turns: [("s1", 0, 3)])
        naming.advance()
        #expect(naming.assignment(of: "s1") == .candidate(participantID: "a"))
        #expect(naming.name(of: "s1") == nil)
    }
    @Test func overlappedTurnsAndCrosstalkAreNotEvidence() {
        var naming = SpeakerNaming()
        naming.observe(roster: roster)
        naming.observe(activities: [.init(participantID: "a", start: 0, end: 6), .init(participantID: "b", start: 0, end: 3)], through: 9)
        naming.observe(turn: .init(id: "1", cluster: "s1", start: 0, end: 3))
        naming.observe(turn: .init(id: "2", cluster: "s1", start: 3, end: 6, overlapped: true))
        naming.advance()
        #expect(naming.assignment(of: "s1") == .unknown)
    }
    @Test func localSpeakingMakesTheIntervalNonExclusive() {
        var naming = timeline([("a", 0, 12), ("me", 0, 12)], turns: [("s1", 0, 6), ("s1", 6, 12)])
        naming.advance()
        #expect(naming.assignment(of: "s1") == .unknown)
    }
    @Test func replayingTheSameTurnAddsNoVote() {
        var naming = timeline([("a", 0, 10)], turns: [("s1", 0, 3)])
        for _ in 0..<5 { naming.observe(turn: .init(id: "t0", cluster: "s1", start: 0, end: 3)) }
        naming.advance()
        #expect(naming.assignment(of: "s1") == .candidate(participantID: "a"))
    }
    @Test func activityAfterTheWatermarkIsUnknown() {
        var naming = SpeakerNaming()
        naming.observe(roster: roster)
        naming.observe(activities: [.init(participantID: "a", start: 0, end: nil)], through: 0.5)
        naming.observe(turn: .init(id: "1", cluster: "s1", start: 0, end: 5))
        naming.observe(turn: .init(id: "2", cluster: "s1", start: 5, end: 10))
        naming.advance()
        #expect(naming.assignment(of: "s1") == .unknown)
    }
    @Test func uncertainEdgesAreTrimmed() {
        var naming = SpeakerNaming()
        naming.observe(roster: roster)
        naming.observe(activities: [.init(participantID: "a", start: 0, end: 2, uncertainty: 0.6)], through: 10)
        naming.observe(turn: .init(id: "1", cluster: "s1", start: 0, end: 2))
        naming.advance()
        #expect(naming.assignment(of: "s1") == .unknown)
    }
    @Test func contradictionDisputesAndOnlyFreshEvidenceReconfirms() {
        var naming = timeline([("a", 0, 6), ("b", 6, 12)], turns: [("s1", 0, 3), ("s1", 3, 6)])
        naming.advance()
        #expect(naming.name(of: "s1") == "Anna")
        naming.observe(turn: .init(id: "x1", cluster: "s1", start: 6, end: 9))
        naming.observe(turn: .init(id: "x2", cluster: "s1", start: 9, end: 12))
        naming.advance()
        #expect(naming.assignment(of: "s1") == .disputed)
        #expect(naming.name(of: "s1") == nil)
        naming.advance()
        #expect(naming.assignment(of: "s1") == .disputed)
        naming.observe(activities: [.init(participantID: "a", start: 0, end: 6), .init(participantID: "b", start: 6, end: 18)], through: 18)
        naming.observe(turn: .init(id: "x3", cluster: "s1", start: 12, end: 15))
        naming.observe(turn: .init(id: "x4", cluster: "s1", start: 15, end: 18))
        naming.advance()
        #expect(naming.name(of: "s1") == "Boris")
    }
    @Test func renameKeepsTheIdentity() {
        var naming = timeline([("a", 0, 6)], turns: [("s1", 0, 3), ("s1", 3, 6)])
        naming.advance()
        naming.observe(roster: [Participant(id: "a", name: "Anna K.")])
        #expect(naming.name(of: "s1") == "Anna K.")
    }
    @Test func resetClusterForgetsItsName() {
        var naming = timeline([("a", 0, 6)], turns: [("s1", 0, 3), ("s1", 3, 6)])
        naming.advance()
        naming.reset(cluster: "s1")
        #expect(naming.assignment(of: "s1") == .unknown)
    }
    @Test func oneLongIndicatorCannotDominate() {
        var naming = timeline([("a", 0, 60)], turns: [("s1", 0, 60)])
        naming.advance()
        #expect(naming.assignment(of: "s1") == .candidate(participantID: "a"))
    }

    private func timeline(_ spoken: [(String, Double, Double)], turns: [(String, Double, Double)]) -> SpeakerNaming {
        var naming = SpeakerNaming()
        naming.observe(roster: roster)
        naming.observe(activities: spoken.map { .init(participantID: $0.0, start: $0.1, end: $0.2) }, through: spoken.map(\.2).max() ?? 0)
        for (index, turn) in turns.enumerated() { naming.observe(turn: .init(id: "t\(index)", cluster: turn.0, start: turn.1, end: turn.2)) }
        return naming
    }
}
