import Testing
import TranscriptLayout

struct TranscriptLayoutIncrementalTests {
    @Test(arguments: [false, true], [false, true])
    func changingLateMembershipMergesOrSplitsNeighbours(wasLate: Bool, nowLate: Bool) {
        let first = Text(Key(0), 2, end: 12, late: true)
        let last = Text(Key(1), 6, late: true)
        var state = makeStorage([first, last, Text(Key(2), 4, late: wasLate)])
        makeLayout().update(&state, entries: [first, Text(Key(2), 4, late: nowLate), last], replacing: true, newlyFinal: 0)
        let a = Shown(id: 0, time: "00:02", speaker: 0, words: "words")
        let b = Shown(id: 2, time: "00:04", speaker: 0, words: "words")
        let c = Shown(id: 1, time: "00:06", speaker: 0, words: "words")
        #expect(Array(state.rows) == (nowLate
            ? [.late(span: "00:02–00:12", entries: [a, b, c])]
            : [.late(span: "00:02–00:12", entries: [a]), .entry(b), .late(span: "00:06–00:07", entries: [c])]))
        #expect(state.locations[Key(1)] == (nowLate ? .init(row: 0, lateEntry: 2) : .init(row: 2, lateEntry: 0)))
    }

    @Test(arguments: [3.0, 15.0])
    func revisedEndCanShortenOrLengthenTheGroup(end: Double) {
        var state = makeStorage([Text(Key(0), 2, end: 12, late: true), Text(Key(1), 6, late: true)])
        makeLayout().update(&state, entries: [Text(Key(0), 2, end: end, late: true), Text(Key(1), 6, late: true)],
                            replacing: true, newlyFinal: 0)
        #expect(Array(state.rows) == [.late(span: end == 3 ? "00:02–00:07" : "00:02–00:15", entries: [
            .init(id: 0, time: "00:02", speaker: 0, words: "words"),
            .init(id: 1, time: "00:06", speaker: 0, words: "words"),
        ])])
    }

    @Test func listeningOmissionJoinsLateGroups() {
        let first = Text(Key(0), 2, end: 12, late: true)
        let last = Text(Key(1), 6, late: true)
        var state = makeStorage([first, last, Text(Key(2), 4)])
        makeLayout().update(&state, entries: [first, last], replacing: true, newlyFinal: 0)
        #expect(state.anchors[Key(2)] == nil)
        #expect(state.entries[Key(2)] == nil)
        #expect(state.locations[Key(2)] == nil)
        #expect(Array(state.rows) == [.late(span: "00:02–00:12", entries: [
            .init(id: 0, time: "00:02", speaker: 0, words: "words"),
            .init(id: 1, time: "00:06", speaker: 0, words: "words"),
        ])])
    }

    @Test func multipleRevisionsInsideOneGroupKeepEveryNewWord() {
        var state = makeStorage([Text(Key(0), 2, late: true), Text(Key(1), 6, late: true)])
        makeLayout().update(&state, entries: [Text(Key(0), 2, late: true, words: "first revised"),
                                            Text(Key(1), 6, late: true, words: "last revised")],
                            replacing: true, newlyFinal: 0)
        #expect(Array(state.rows) == [.late(span: "00:02–00:07", entries: [
            .init(id: 0, time: "00:02", speaker: 0, words: "first revised"),
            .init(id: 1, time: "00:06", speaker: 0, words: "last revised"),
        ])])
    }

    @Test func omittingTailPreservesTheFinalPrefixAndReindexesRemainingRows() {
        var state = makeStorage((0..<4).map { Text(Key($0), Double($0)) }, final: 2)
        let sealed = state.rows.sealed
        let revision = state.revision
        makeLayout().update(&state, entries: [Text(Key(3), 3)], replacing: true, newlyFinal: 0)
        #expect(state.rows.sealed == sealed)
        #expect(state.revision == revision)
        #expect(state.rows.tail == [.entry(.init(id: 3, time: "00:03", speaker: 0, words: "words"))])
        #expect(state.ordered == [Key(0), Key(1), Key(3)])
        #expect(state.locations[Key(3)] == .init(row: 2))
    }

    @Test func lateTailRebuildKeepsTheSealedPrefix() {
        var state = makeStorage([Text(Key(0), 0), Text(Key(1), 2, late: true)], final: 1)
        let sealed = state.rows.sealed
        let revision = state.revision
        makeLayout().update(&state, entries: [Text(Key(1), 2, end: 8, late: true), Text(Key(2), 5, late: true)],
                            replacing: true, newlyFinal: 0)
        #expect(state.rows.sealed == sealed)
        #expect(state.revision == revision)
        #expect(state.rows.tail == [.late(span: "00:02–00:08", entries: [
            .init(id: 1, time: "00:02", speaker: 0, words: "words"),
            .init(id: 2, time: "00:05", speaker: 0, words: "words"),
        ])])
    }

    @Test func gapAmongFinalRowsRebuildsAndInvalidatesTheirLayout() {
        var state = makeStorage([Text(Key(0), 2), Text(Key(1), 6)], final: 2)
        let revision = state.revision
        state.gaps = [.init(began: 4, content: "gap")]
        makeLayout().rebuild(&state)
        #expect(state.revision == revision + 1)
        #expect(Array(state.rows) == [
            .entry(.init(id: 0, time: "00:02", speaker: 0, words: "words")), .gap("gap", time: "00:04"),
            .entry(.init(id: 1, time: "00:06", speaker: 0, words: "words")),
        ])
        #expect(state.locations[Key(1)] == .init(row: 2))
    }

    @Test func unpreparedPublicStorageUsesTheOriginalAnchors() {
        var state = MemoryStorage()
        state.texts = [Key(0): Text(Key(0), 99)]
        state.anchors = [Key(0): .init(id: 7, start: 2)]
        state.nextDisplayID = 8
        makeLayout().prepare(&state)
        #expect(Array(state.rows) == [.entry(.init(id: 7, time: "00:02", speaker: 0, words: "words"))])
        #expect(state.ordered == [Key(0)])
        #expect(state.locations[Key(0)] == .init(row: 0))
        let revision = state.revision
        makeLayout().prepare(&state)
        #expect(state.revision == revision)
    }
}
