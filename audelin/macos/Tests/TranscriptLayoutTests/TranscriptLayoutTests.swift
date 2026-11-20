import Testing
import TranscriptLayout

struct TranscriptLayoutTests {
    @Test func callOrderGivesEachSpeakerItsOwnRow() {
        let later = Text(Key(0, 1), 8, words: "pending")
        let earlier = Text(Key(1, 1), 2, words: "first")
        let state = makeStorage([later, earlier])
        #expect(Array(state.rows) == [
            .entry(.init(id: 1, time: "00:02", speaker: 1, words: "first")),
            .entry(.init(id: 0, time: "00:08", speaker: 0, words: "pending")),
        ])
    }

    @Test func settlingKeepsIDsTimesAndOrder() {
        var state = makeStorage([Text(Key(0, 1), 8, words: "pending"), Text(Key(1, 1), 2)])
        let before = state.ordered
        makeLayout().update(&state, entries: [Text(Key(0, 1), 99, words: "firm next"), Text(Key(1, 1), 20)],
                            replacing: true, newlyFinal: 0)
        #expect(state.ordered == before)
        #expect(state.anchors[Key(0, 1)] == .init(id: 0, start: 8))
        #expect(state.anchors[Key(1, 1)] == .init(id: 1, start: 2))
        #expect(Array(state.rows) == [
            .entry(.init(id: 1, time: "00:02", speaker: 1, words: "words")),
            .entry(.init(id: 0, time: "00:08", speaker: 0, words: "firm next")),
        ])
    }

    @Test func equalStartTimesKeepArrivalOrder() {
        var state = makeStorage([Text(Key(1, 9), 4), Text(Key(0, 2), 4)])
        makeLayout().update(&state, entries: [Text(Key(0, 2), 4), Text(Key(1, 9), 4), Text(Key(0, 1), 4)],
                            replacing: true, newlyFinal: 0)
        #expect(state.ordered == [Key(1, 9), Key(0, 2), Key(0, 1)])
        #expect(state.ordered.compactMap { state.entries[$0]?.id } == [0, 1, 2])
    }

    @Test func consecutiveLateEntriesGroupInCallOrder() {
        let state = makeStorage([
            Text(Key(0), 90), Text(Key(1), 61.9, end: 80, late: true),
            Text(Key(2), 65, end: 70, late: true), Text(Key(3), 2),
        ])
        #expect(Array(state.rows) == [
            .entry(.init(id: 3, time: "00:02", speaker: 0, words: "words")),
            .late(span: "01:01–01:20", entries: [
                .init(id: 1, time: "01:01", speaker: 0, words: "words"),
                .init(id: 2, time: "01:05", speaker: 0, words: "words"),
            ]),
            .entry(.init(id: 0, time: "01:30", speaker: 0, words: "words")),
        ])
    }

    @Test func gapsSplitLateGroupsAtTheirTime() {
        let state = makeStorage([Text(Key(0), 2, end: 8, late: true), Text(Key(1), 6, late: true)],
                                gaps: [.init(began: 4, content: "mic")])
        #expect(Array(state.rows) == [
            .late(span: "00:02–00:08", entries: [.init(id: 0, time: "00:02", speaker: 0, words: "words")]),
            .gap("mic", time: "00:04"),
            .late(span: "00:06–00:07", entries: [.init(id: 1, time: "00:06", speaker: 0, words: "words")]),
        ])
        #expect(state.locations[Key(1)] == .init(row: 2, lateEntry: 0))
    }

    @Test func lateTextKeepsTheGapAtItsTime() {
        var state = makeStorage([Text(Key(0), 2), Text(Key(1), 6)], gaps: [.init(began: 4, content: "mic")])
        let texts = [Text(Key(0), 2, late: true), Text(Key(1), 6, late: true)]
        makeLayout().update(&state, entries: texts, replacing: true, newlyFinal: 0)
        let expected = Array(state.rows)
        for _ in 0..<3 { makeLayout().update(&state, entries: texts, replacing: true, newlyFinal: 0) }
        #expect(Array(state.rows) == expected)
        #expect(expected == [
            .late(span: "00:02–00:03", entries: [.init(id: 0, time: "00:02", speaker: 0, words: "words")]),
            .gap("mic", time: "00:04"),
            .late(span: "00:06–00:07", entries: [.init(id: 1, time: "00:06", speaker: 0, words: "words")]),
        ])
    }

    @Test func reusedSlotGetsAFreshTimeAndID() {
        var state = makeStorage([Text(Key(0), 2), Text(Key(1), 6)])
        makeLayout().update(&state, entries: [Text(Key(1), 6)], replacing: true, newlyFinal: 0)
        #expect(state.anchors[Key(0)] == nil)
        makeLayout().update(&state, entries: [Text(Key(0), 10, words: "new"), Text(Key(1), 6)], replacing: true, newlyFinal: 0)
        #expect(state.anchors[Key(0)] == .init(id: 2, start: 10))
        #expect(Array(state.rows) == [
            .entry(.init(id: 1, time: "00:06", speaker: 0, words: "words")),
            .entry(.init(id: 2, time: "00:10", speaker: 0, words: "new")),
        ])
    }

    @Test func interruptionPreservesOmittedEntries() {
        var state = makeStorage([Text(Key(0), 2)])
        let before = Array(state.rows)
        makeLayout().update(&state, entries: [], replacing: false, newlyFinal: 0)
        #expect(Array(state.rows) == before)
        #expect(state.anchors[Key(0)] == .init(id: 0, start: 2))
    }

    @Test func gapsBeforeAtAndAfterTextKeepStableOrder() {
        var state = makeStorage([Text(Key(0), 4)], gaps: [
            .init(began: 9, content: "last"), .init(began: 4, content: "equal first"),
            .init(began: 0, content: "first"), .init(began: 4, content: "equal second"),
        ])
        let expected: [LayoutRow<Shown, String>] = [
            .gap("first", time: "00:00"), .gap("equal first", time: "00:04"),
            .gap("equal second", time: "00:04"),
            .entry(.init(id: 0, time: "00:04", speaker: 0, words: "words")), .gap("last", time: "00:09"),
        ]
        #expect(Array(state.rows) == expected)
        makeLayout().rebuild(&state)
        #expect(Array(state.rows) == expected)
    }

    @Test func revisingTheTailDoesNotReadFinalText() {
        var state = makeStorage((0..<100).map { Text(Key($0), Double($0)) }, final: 99)
        let sealed = state.rows.sealed
        let revision = state.revision
        makeLayout().update(&state, entries: [Text(Key(99), 99, words: "revised")], replacing: true, newlyFinal: 0)
        #expect(state.reads.text == [Key(99)])
        #expect(state.rows.sealed == sealed)
        #expect(state.revision == revision)
        #expect(state.rows.tail == [.entry(.init(id: 99, time: "01:39", speaker: 0, words: "revised"))])
    }

    @Test func finalLateGroupStaysOpenForFollowingRecovery() {
        var state = makeStorage([Text(Key(0), 1, late: true)], final: 1)
        #expect(state.rows.sealed.isEmpty)
        makeLayout().update(&state, entries: [Text(Key(1), 4, late: true)], replacing: true, newlyFinal: 1)
        #expect(Array(state.rows) == [.late(span: "00:01–00:05", entries: [
            .init(id: 0, time: "00:01", speaker: 0, words: "words"),
            .init(id: 1, time: "00:04", speaker: 0, words: "words"),
        ])])
    }

    @Test func newEarlierEntryInvalidatesSealedRows() {
        var state = makeStorage([Text(Key(0), 10), Text(Key(1), 20)], final: 1)
        let revision = state.revision
        makeLayout().update(&state, entries: [Text(Key(2), 2), Text(Key(1), 20)], replacing: true, newlyFinal: 0)
        #expect(state.revision == revision + 1)
        #expect(Array(state.rows) == [
            .entry(.init(id: 2, time: "00:02", speaker: 0, words: "words")),
            .entry(.init(id: 0, time: "00:10", speaker: 0, words: "words")),
            .entry(.init(id: 1, time: "00:20", speaker: 0, words: "words")),
        ])
    }

    @Test func removingGapJoinsLateGroupsWithTheirLongestEnd() {
        var state = makeStorage([Text(Key(0), 2, end: 12, late: true), Text(Key(1), 6, late: true)],
                                gaps: [.init(began: 4, content: "mic")])
        state.gaps = []
        makeLayout().rebuild(&state)
        #expect(Array(state.rows) == [.late(span: "00:02–00:12", entries: [
            .init(id: 0, time: "00:02", speaker: 0, words: "words"),
            .init(id: 1, time: "00:06", speaker: 0, words: "words"),
        ])])
    }
}
