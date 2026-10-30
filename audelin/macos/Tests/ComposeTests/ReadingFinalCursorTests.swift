@testable import CallText
import PanelUI
import Reading
import Testing
@testable import Compose

/// Reading the call from the final cursor must show what reading it whole shows.
struct ReadingFinalCursorTests {

    private static func entry(_ index: Int, words: String, later: Bool = false) -> State.Entry {

        let start = Double(index) * 6
        return .init(speaker: index % 2 == 0 ? .mine : .theirs,
                     text: .init(id: index, start: start, end: start + 5, settled: words, pending: ""),
                     writtenLater: later)
    }

    /// A call whose tail changes and goes, with several entries going final at once.
    private static func states(later: Bool) -> [State] {

        var states: [State] = []
        func add(_ count: Int, final: Int, last: String = "") {
            var entries = (0..<count).map { entry($0, words: "words \($0)", later: later && $0 % 4 == 1) }
            if !last.isEmpty { entries[count - 1] = entry(count - 1, words: last) }
            var state = State(status: .listening, entries: entries)
            state.finalCount = final
            states.append(state)
        }
        add(1, final: 0)
        add(3, final: 0, last: "growing")
        add(3, final: 0, last: "growing more")
        add(2, final: 0)
        add(6, final: 4)
        add(7, final: 4, last: "tail")
        add(8, final: 7, last: "tail again")
        add(8, final: 8)
        return states
    }

    private func wholeAndCursor(
        later: Bool, between: (Int) -> ReadingEvent? = { _ in nil }
    ) -> [(whole: ReadingState, cursor: ReadingState, panel: PanelState)] {

        var whole = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 0))).0
        var cursor = whole
        var mapped = 0
        var rows = MappedRows()
        var result: [(ReadingState, ReadingState, PanelState)] = []
        for (index, state) in Self.states(later: later).enumerated() {
            if let event = between(index) {
                whole = ReadingReducer.reduce(whole, event).0
                cursor = ReadingReducer.reduce(cursor, event).0
            }
            whole = ReadingReducer.reduce(whole, .textUpdated(readingText(state))).0
            cursor = ReadingReducer.reduce(cursor, .textUpdated(readingText(state, from: mapped))).0
            mapped = state.finalCount
            result.append((whole, cursor, panelState(cursor, rows: &rows)))
        }
        return result
    }

    @Test(arguments: [false, true])
    func readingFromTheCursorShowsWhatReadingWholeShows(later: Bool) {

        for step in wholeAndCursor(later: later) {
            #expect(step.cursor.log == step.whole.log)
            #expect(step.panel == panelState(step.whole))
        }
    }

    @Test func aGapAfterEntriesWentFinalKeepsItsPlace() {

        let problem = ReadingEvent.problemsChanged([.init(.microphone, began: 20)])
        for step in wholeAndCursor(later: false, between: { $0 == 6 ? problem : nil }) {
            #expect(step.cursor.log == step.whole.log)
            #expect(step.panel == panelState(step.whole))
        }
    }

    @Test func aWordChangesOnlyTheTail() {

        let steps = wholeAndCursor(later: false)
        guard case let .lines(lines) = steps[5].cursor.log else { Issue.record("no lines"); return }
        #expect(lines.rows.sealed.count == 4)
        #expect(lines.rows.tail.count == 3)
    }
}
