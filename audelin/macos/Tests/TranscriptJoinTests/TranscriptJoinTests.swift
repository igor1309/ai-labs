import Foundation
import Testing
import TranscriptJoin

struct TranscriptJoinTests {

    @Test func partsJoinInTimeOrder() {

        let joined = TranscriptJoin.join([part(at: 10 * 60, rows: [row(1, "b1")]), part(at: 0, rows: [row(1, "a1")])])
        #expect(joined.map(\.marker) == ["a1", "b1"])
    }

    @Test func rowsKeepTheirTimeOfDay() {

        let joined = TranscriptJoin.join([part(at: 0, rows: [row(30, "a")]), part(at: 10 * 60, rows: [row(5, "b")])])
        #expect(joined.map(\.time) == [30, 605])
    }

    @Test func rowsPassThroughUnchangedButForTheirTime() {

        let a = [row(1, "a1", extra: [1, 2]), row(2, "a2", extra: [])]
        let b = [row(0, "b1", extra: [3])]
        let joined = TranscriptJoin.join([part(at: 0, rows: a), part(at: 60, rows: b)])
        #expect(joined == a + [row(60, "b1", extra: [3])])
    }

    @Test func partsWithTheSameStartKeepTheirGivenOrder() {

        let joined = TranscriptJoin.join([part(at: 0, rows: [row(1, "first")]), part(at: 0, rows: [row(0, "second")])])
        #expect(joined.map(\.marker) == ["first", "second"])
    }

    @Test func noPartsJoinToNothing() {

        #expect(TranscriptJoin.join([TranscriptJoin.Part<Row>]()).isEmpty)
    }
}

private struct Row: JoinRow, Equatable {
    let time: Double
    let marker: String
    let extra: [Int]
    func moved(to time: Double) -> Row { Row(time: time, marker: marker, extra: extra) }
}

private func row(_ time: Double, _ marker: String, extra: [Int] = []) -> Row { Row(time: time, marker: marker, extra: extra) }

private func part(at seconds: Double, length: Double = 60, rows: [Row]) -> TranscriptJoin.Part<Row> {

    .init(start: Date(timeIntervalSinceReferenceDate: 800_000_000 + seconds), length: length, rows: rows)
}
