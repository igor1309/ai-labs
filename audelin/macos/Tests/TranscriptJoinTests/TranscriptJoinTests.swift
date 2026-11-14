import Foundation
import Testing
import TranscriptJoin

struct TranscriptJoinTests {

    @Test func partsJoinInTimeOrder() {

        let joined = rows([part(at: 10 * 60, rows: [row(1, "b1")]), part(at: 0, rows: [row(1, "a1")])])
        #expect(joined.map(\.marker) == ["a1", "b1"])
    }

    @Test func rowsKeepTheirTimeOfDay() {

        let joined = rows([part(at: 0, rows: [row(30, "a")]), part(at: 10 * 60, rows: [row(5, "b")])])
        #expect(joined.map(\.time) == [30, 605])
    }

    @Test func rowsPassThroughUnchangedButForTheirTime() {

        let a = [row(1, "a1", extra: [1, 2]), row(2, "a2", extra: [])]
        let b = [row(0, "b1", extra: [3])]
        let joined = rows([part(at: 0, rows: a), part(at: 60, rows: b)])
        #expect(joined == a + [row(60, "b1", extra: [3])])
    }

    @Test func partsWithTheSameStartKeepTheirGivenOrder() {

        let joined = rows([part(at: 0, rows: [row(1, "first")]), part(at: 0, rows: [row(0, "second")])])
        #expect(joined.map(\.marker) == ["first", "second"])
    }

    @Test func aGapSaysHowLongTheCallWasCutOff() {

        let joined = TranscriptJoin.join([part(at: 0, length: 480, rows: [row(1, "a")]), part(at: 600, rows: [row(1, "b")])])
        #expect(joined.items.map(describe) == ["a@1", "gap@480+120", "b@601"])
    }

    @Test func overlappingPartsJoinWithAGapOfNoLength() {

        let joined = TranscriptJoin.join([part(at: 0, length: 720, rows: [row(1, "a")]), part(at: 600, rows: [row(1, "b")])])
        #expect(joined.items.map(describe) == ["a@1", "gap@720+0", "b@601"])
    }

    @Test func oneGapSitsBetweenEachTwoParts() {

        let joined = TranscriptJoin.join([part(at: 200, length: 50, rows: []), part(at: 0, length: 100, rows: [row(0, "a")]), part(at: 300, rows: [row(0, "c")])])
        #expect(joined.items.map(describe) == ["a@0", "gap@100+100", "gap@250+50", "c@300"])
    }

    @Test func theSameSpeakerKeyInTwoPartsIsTwoSpeakers() {

        let a = part(at: 0, rows: [row(1, "a", speaker: "1"), row(2, "me")], speakers: [.init(key: "1", name: "Anna")])
        let b = part(at: 600, rows: [row(1, "b", speaker: "1")], speakers: [.init(key: "1", name: "Boris")])
        let joined = TranscriptJoin.join([b, a])
        let keys = joined.items.compactMap { if case .row(let row) = $0 { row.speaker } else { nil } }
        #expect(keys == ["1.1", "2.1"])
        #expect(joined.speakers == [.init(key: "1.1", name: "Anna"), .init(key: "2.1", name: "Boris")])
        let rows = rows([b, a])
        #expect(rows.map(\.marker) == ["a", "me", "b"])
        #expect(rows[1].speaker == nil)
    }

    @Test func noPartsJoinToNothing() {

        #expect(TranscriptJoin.join([TranscriptJoin.Part<Row, Speaker>]()).items.isEmpty)
    }
}

/// The joined rows alone, gaps left out.
private func rows(_ parts: [TranscriptJoin.Part<Row, Speaker>]) -> [Row] {

    TranscriptJoin.join(parts).items.compactMap { if case .row(let row) = $0 { row } else { nil } }
}

private func describe(_ item: TranscriptJoin.Item<Row>) -> String {

    switch item {
    case .row(let row): "\(row.marker)@\(Int(row.time))"
    case .gap(let at, let length): "gap@\(Int(at))+\(Int(length))"
    }
}

private struct Row: JoinRow, Equatable {
    let time: Double
    let marker: String
    let extra: [Int]
    var speaker: String? = nil
    func moved(to time: Double, speaker: String?) -> Row { Row(time: time, marker: marker, extra: extra, speaker: speaker) }
}

private struct Speaker: JoinSpeaker, Equatable {
    let key: String
    let name: String
    func keyed(_ key: String) -> Speaker { Speaker(key: key, name: name) }
}

private func row(_ time: Double, _ marker: String, extra: [Int] = [], speaker: String? = nil) -> Row {

    Row(time: time, marker: marker, extra: extra, speaker: speaker)
}

private func part(at seconds: Double, length: Double = 60, rows: [Row], speakers: [Speaker] = []) -> TranscriptJoin.Part<Row, Speaker> {

    .init(start: Date(timeIntervalSinceReferenceDate: 800_000_000 + seconds), length: length, rows: rows, speakers: speakers)
}
