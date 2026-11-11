import CallDiarizer
@testable import Composer
import Testing

@Suite struct AfterCallNamesTests {

    @Test func confirmedClustersNameTheirRowsAndOthersStayGeneric() {

        var board = LiveNameBoard.Names()
        board.roster = ["Anna", "Boris"]
        board.spoken = [("Anna", 0, 4), ("Boris", 4, 8), ("Anna", 8, 12), ("Boris", 12, 16)]
        board.through = 30
        let turns = [0, 4, 8, 12].enumerated().map { CallDiarizer.Turn(speaker: $0.offset % 2, start: Double($0.element), end: Double($0.element + 4)) }
            + [CallDiarizer.Turn(speaker: 2, start: 20, end: 24)]
        let names = AfterCallNames.names(rows: [(1, 0, 4), (2, 4, 8), (3, 20, 24)], turns: turns, board: board)
        #expect(names == [1: "Anna", 2: "Boris"])
        #expect(AfterCallNames.clusterNames(turns: turns, board: board) == [0: "Anna", 1: "Boris"])
    }
}
