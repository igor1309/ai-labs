import SpeakerNaming
import Testing

@Suite struct AfterCallNamesTests {

    @Test func confirmedClustersNameTheirRowsAndOthersStayGeneric() {
        let evidence = CallEvidence(
            roster: ["Anna", "Boris"],
            spoken: [.init(name: "Anna", start: 0, end: 4), .init(name: "Boris", start: 4, end: 8),
                     .init(name: "Anna", start: 8, end: 12), .init(name: "Boris", start: 12, end: 16)],
            through: 30)
        let turns = [0, 4, 8, 12].enumerated().map { DiarizedTurn(speaker: $0.offset % 2, start: Double($0.element), end: Double($0.element + 4)) }
            + [DiarizedTurn(speaker: 2, start: 20, end: 24)]
        let names = AfterCallNames.names(rows: [(1, 0, 4), (2, 4, 8), (3, 20, 24)], turns: turns, evidence: evidence)
        #expect(names == [1: "Anna", 2: "Boris"])
        #expect(AfterCallNames.clusterNames(turns: turns, evidence: evidence) == [0: "Anna", 1: "Boris"])
    }
}
