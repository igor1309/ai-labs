import SpeakerNaming
import Testing

@Suite struct LiveNamesTests {
    let roster = [Participant(id: "me", name: "Igor", isLocal: true), Participant(id: "a", name: "Anna"), Participant(id: "b", name: "Boris")]

    @Test func aRowSpokenWhileOnlyOnePersonIsShownGetsTheirName() {
        var names = LiveNames()
        #expect(names.name(row: "1", start: 0, end: 4, roster: roster, activities: [.init(participantID: "a", start: 0, end: 4)], through: 4) == "Anna")
    }
    @Test func overlapOrNobodyLeavesTheRowUnnamed() {
        var names = LiveNames()
        let both = [Activity(participantID: "a", start: 0, end: 4), .init(participantID: "b", start: 0, end: 4)]
        #expect(names.name(row: "1", start: 0, end: 4, roster: roster, activities: both, through: 4) == nil)
        #expect(names.name(row: "2", start: 0, end: 4, roster: roster, activities: [], through: 4) == nil)
    }
    @Test func aShortRowWaits() {
        var names = LiveNames()
        #expect(names.name(row: "1", start: 0, end: 0.5, roster: roster, activities: [.init(participantID: "a", start: 0, end: nil)], through: 0.5) == nil)
    }
    @Test func theLocalParticipantNeverNamesARemoteRow() {
        var names = LiveNames()
        #expect(names.name(row: "1", start: 0, end: 4, roster: roster, activities: [.init(participantID: "me", start: 0, end: 4)], through: 4) == nil)
    }
    @Test func aGivenNameNeverChangesDuringTheCall() {
        var names = LiveNames()
        _ = names.name(row: "1", start: 0, end: 2, roster: roster, activities: [.init(participantID: "a", start: 0, end: 2)], through: 2)
        #expect(names.name(row: "1", start: 0, end: 10, roster: roster, activities: [.init(participantID: "b", start: 0, end: 10)], through: 10) == "Anna")
    }
}
