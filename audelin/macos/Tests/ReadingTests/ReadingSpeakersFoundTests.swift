import Reading
import Testing

struct ReadingSpeakersFoundTests {

    /// `finalCount` 0 leaves every row in the tail, 2 seals the first two, 4 seals them all.
    @Test(arguments: [0, 2, 4])
    func foundSpeakersGiveEachFarRowItsPlaceAndLeaveTheMicrophone(finalCount: Int) {

        func entry(_ speaker: ReadingState.Speaker, _ id: Int, _ start: Double) -> ReadingTextUpdate.Entry {
            .init(id: .init(speaker: speaker, localID: id), start: start, end: start + 1, settled: "x")
        }
        let update = ReadingTextUpdate(status: .listening, entries: [entry(.theirs, 1, 1), entry(.mine, 1, 2), entry(.theirs, 2, 3), entry(.theirs, 3, 5)], finalCount: finalCount)
        var state = ReadingReducer.reduce(ReadingState(), .textUpdated(update)).0
        state = ReadingReducer.reduce(state, .speakersFound([1: 1, 2: 2])).0
        let entries = state.lines.rows.compactMap { row -> ReadingState.Entry? in
            if case let .entry(entry) = row { entry } else { nil }
        }
        #expect(entries.map(\.remoteSpeaker) == [1, nil, 2, nil])
    }
}
