import Reading
import Testing

struct ReadingNamesConfirmedTests {

    @Test func confirmedNamesReplaceTentativeOnesAndUnconfirmedRowsLoseTheirs() {

        let (sut, spy) = makeSUT()
        assert(makeTentative(), .namesConfirmed([1: "Anna K."]), delivers: nil, using: sut) {
            $0.lines.rows = [.entry(anna("00:01", name: "Anna K.", confirmed: true)), .entry(boris("00:03", name: nil))]
            $0.rendered.entries[annaText.id] = anna("00:01", name: "Anna K.", confirmed: true)
            $0.rendered.entries[borisText.id] = boris("00:03", name: nil)
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }
}

private let annaText = theirs(1, at: 1, name: "Anna")
private let borisText = theirs(2, at: 3, name: "Boris")

private func makeTentative() -> ReadingState {

    makeListening(entries: [annaText, borisText], rows: [.entry(anna("00:01", name: "Anna")), .entry(boris("00:03", name: "Boris"))])
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
