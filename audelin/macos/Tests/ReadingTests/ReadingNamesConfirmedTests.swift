import Reading
import Testing

struct ReadingNamesConfirmedTests {

    /// `sealed` 0 leaves both entries in the tail, 1 seals the first, 2 seals both.
    @Test(arguments: [0, 1, 2])
    func confirmedNamesReplaceTentativeOnesAndUnconfirmedRowsLoseTheirs(sealed: Int) {

        let spy = RenderingSpy()
        assert(makeTentative(sealed: sealed), .namesConfirmed([1: "Anna K."]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            let rows: [ReadingState.Row] = [.entry(anna("line(1.0)", name: "Anna K.", confirmed: true)), .entry(boris("line(3.0)", name: nil))]
            $0.lines.rows = .init(sealed: Array(rows.prefix(sealed)), tail: Array(rows.dropFirst(sealed)))
            $0.rendered.entries[annaText.id] = anna("line(1.0)", name: "Anna K.", confirmed: true)
            $0.rendered.entries[borisText.id] = boris("line(3.0)", name: nil)
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }
}

private let annaText = theirs(1, at: 1, name: "Anna")
private let borisText = theirs(2, at: 3, name: "Boris")

private func makeTentative(sealed: Int) -> ReadingState {

    makeListening(entries: [annaText, borisText], rows: [.entry(anna("line(1.0)", name: "Anna")), .entry(boris("line(3.0)", name: "Boris"))], sealed: sealed)
}

private func anna(_ time: String, name: String?, confirmed: Bool = false) -> ReadingState.Entry {

    .init(id: 1, time: time, speaker: .theirs, settled: "x", name: name, nameConfirmed: confirmed)
}

private func boris(_ time: String, name: String?) -> ReadingState.Entry {

    .init(id: 2, time: time, speaker: .theirs, settled: "x", name: name)
}

private func theirs(_ id: Int, at start: Double, name: String) -> ReadingTextUpdate.Entry {

    .init(id: .init(speaker: .theirs, localID: id), start: start, end: start + 1, settled: "x", name: name)
}
