import Reading
import Testing

struct ReadingSpeakersFoundTests {

    /// `sealed` 0 leaves every row in the tail, 2 seals the first two, 4 seals them all.
    @Test(arguments: [0, 2, 4])
    func foundSpeakersGiveEachFarRowItsPlaceAndLeaveTheMicrophone(sealed: Int) {

        let spy = RenderingSpy()
        assert(makeUnplaced(sealed: sealed), .speakersFound([1: 1, 2: 2]), delivers: nil, using: makeReducer(spy)) {
            $0.speakerPlaces = [1: 1, 2: 2]
            for (key, entry) in zip(texts.map(\.id), shown("given", remote: [1, nil, 2, nil])) { $0.rendered.entries[key] = entry }
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
        #expect(spy.layoutCalls.map(\.change) == [.rebuild])
    }

    @Test func endingTextAppliesPendingPlacesToSealedAndMutableLogRows() {
        var state = makeUnplaced(sealed: 2)
        state.textEnded = false
        state.pendingSpeakerPlaces = [1: 1, 2: 2]
        let placed = shown("given", remote: [1, nil, 2, nil])
        let spy = RenderingSpy { layout in
            layout.rows = .init(sealed: placed.prefix(2).map(ReadingState.Row.entry),
                                tail: placed.dropFirst(2).map(ReadingState.Row.entry))
            layout.revision = 1
        }

        assert(state, .textEnded, delivers: nil, using: makeReducer(spy)) {
            $0.textEnded = true
            $0.pendingSpeakerPlaces = nil
            $0.speakerPlaces = [1: 1, 2: 2]
            for (key, entry) in zip(texts.map(\.id), placed) { $0.rendered.entries[key] = entry }
            $0.lines.rows = .init(sealed: placed.prefix(2).map(ReadingState.Row.entry),
                                  tail: placed.dropFirst(2).map(ReadingState.Row.entry))
            $0.lines.layout = 1
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.map(\.change) == [.rebuild])
        let requestedPlaces = spy.layoutCalls.map { call in
            texts.map { call.value.rendered.entries[$0.id]?.remoteSpeaker }
        }
        #expect(requestedPlaces == [[1, nil, 2, nil]])
    }
}

private let texts = [entry(.theirs, 1, at: 1), entry(.mine, 1, at: 2), entry(.theirs, 2, at: 3), entry(.theirs, 3, at: 5)]

private func makeUnplaced(sealed: Int) -> ReadingState {

    var state = makeListening(entries: texts, rows: rows("given", remote: [nil, nil, nil, nil]), displayIDs: [0, 1, 2, 3], sealed: sealed)
    state.textEnded = true
    return state
}

private func rows(_ time: String, remote: [Int?]) -> [ReadingState.Row] { shown(time, remote: remote).map(ReadingState.Row.entry) }

private func shown(_ time: String, remote: [Int?]) -> [ReadingState.Entry] {

    zip(texts.indices, remote).map { index, speaker in
        .init(id: index, time: time, speaker: texts[index].id.speaker,
              settled: "x", remoteSpeaker: speaker)
    }
}

private func entry(_ speaker: ReadingState.Speaker, _ id: Int, at start: Double) -> ReadingTextUpdate.Entry {

    .init(id: .init(speaker: speaker, localID: id), start: start, end: start + 1, settled: "x")
}
