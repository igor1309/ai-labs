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
            var state = State(status: .listening, entries: .init(tail: entries))
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

    /// Random calls: entries arrive out of order and turn late, and a prefix goes final.
    /// With nothing sealed every layout is a full one, so it is the oracle for keeping sealed rows.
    @Test(arguments: 0..<40)
    func keepingSealedRowsLaysOutWhatAFullLayoutDoes(seed: Int) {

        var random = UInt64(seed + 1) &* 0x9E37_79B9_7F4A_7C15
        func next(_ bound: Int) -> Int {
            random = random &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Int((random >> 33) % UInt64(bound))
        }
        let listening = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 0))).0
        var sealing = listening, oracle = listening
        var entries: [State.Entry] = []
        var final = 0, mapped = 0
        for id in 0..<120 {
            let floor = entries.prefix(final).last?.text.start ?? 0
            let newest = entries.last?.text.start ?? 0
            let start = max(floor, newest + Double(next(7)) - 3)
            let later = next(5) == 0
            let added = State.Entry(
                speaker: next(2) == 0 ? .mine : .theirs,
                text: .init(id: id, start: start, end: start + 1, settled: "word\(id)", pending: ""), writtenLater: later
            )
            let place = entries[final...].firstIndex { $0.text.start > start } ?? entries.count
            entries.insert(added, at: place)
            if next(3) == 0, entries.count > final {
                let index = final + next(entries.count - final)
                let old = entries[index]
                entries[index] = .init(speaker: old.speaker, text: old.text, writtenLater: !old.writtenLater)
            }
            final = min(entries.count, final + next(4))
            if next(4) == 0, entries.count > final + 1 { entries.remove(at: final + next(entries.count - final)) }

            var state = State(status: .listening, entries: .init(tail: entries))
            state.finalCount = final
            sealing = ReadingReducer.reduce(sealing, .textUpdated(readingText(state, from: mapped))).0
            var whole = State(status: .listening, entries: .init(tail: entries))
            whole.finalCount = 0
            oracle = ReadingReducer.reduce(oracle, .textUpdated(readingText(whole))).0
            mapped = final
            #expect(panelState(sealing) == panelState(oracle), "seed \(seed), entry \(id)")
        }
    }

    /// Updates from the cursor do not carry final entries, and a tail entry going must not take them.
    @Test func aTailEntryGoingKeepsTheFinalEntries() {

        var reading = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 0))).0
        let finals = (0..<4).map { Self.entry($0, words: "final \($0)") }
        var first = State(status: .listening, entries: .init(tail: finals + [Self.entry(4, words: "tail"), Self.entry(5, words: "tail")]))
        first.finalCount = 4
        reading = ReadingReducer.reduce(reading, .textUpdated(readingText(first))).0

        var next = State(status: .listening, entries: .init(tail: finals + [Self.entry(5, words: "tail")]))
        next.finalCount = 4
        reading = ReadingReducer.reduce(reading, .textUpdated(readingText(next, from: 4))).0

        var whole = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 0))).0
        whole = ReadingReducer.reduce(whole, .textUpdated(readingText(first))).0
        whole = ReadingReducer.reduce(whole, .textUpdated(readingText(next))).0
        #expect(panelState(reading) == panelState(whole))
        guard case let .lines(lines) = panelState(reading).log else { Issue.record("no lines"); return }
        #expect(lines.rows.count == 5)
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
