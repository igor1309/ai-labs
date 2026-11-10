import Reading
import Testing

struct ReadingNamesConfirmedTests {

    @Test func confirmedNamesReplaceTentativeOnesAndUnconfirmedRowsLoseTheirs() {

        func theirs(_ id: Int, _ start: Double, _ name: String) -> ReadingTextUpdate.Entry {
            .init(id: .init(speaker: .theirs, localID: id), start: start, end: start + 1, settled: "x", name: name)
        }
        let update = ReadingTextUpdate(status: .listening, entries: [theirs(1, 1, "Anna"), theirs(2, 3, "Boris")], finalCount: 2)
        var state = ReadingReducer.reduce(ReadingState(), .textUpdated(update)).0
        state = ReadingReducer.reduce(state, .namesConfirmed([1: "Anna K."])).0
        let entries = state.lines.rows.compactMap { row -> ReadingState.Entry? in
            if case let .entry(entry) = row { entry } else { nil }
        }
        #expect(entries.map(\.name) == ["Anna K.", nil])
        #expect(entries.map(\.nameConfirmed) == [true, false])
    }
}
