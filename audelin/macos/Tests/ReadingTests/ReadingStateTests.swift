import Reading
import Testing

struct ReadingStateTests {

    @Test func publicConstructionPreservesAllSuppliedStorage() {
        let id = ReadingTextUpdate.Entry.ID(speaker: .theirs, localID: 8)
        let text = ReadingTextUpdate.Entry(id: id, start: 2, end: 5, settled: "source")
        let entry = ReadingState.Entry(id: 12, time: "rendered", speaker: .theirs, settled: "shown", pending: " next")
        let gap = ReadingState.Gap(speaker: .mine, time: "gap", kind: .microphone)
        let late = ReadingState.Late(span: "span", entries: [entry])
        let lines = ReadingState.Lines(rows: [.late(late), .gap(gap)], layout: 7,
                                       holds: [.init(entryID: 12, text: " exact ")], newBelow: 3, followsLive: false)
        let state = ReadingState(
            banners: [.init(kind: .microphone, time: "banner")], recording: .on(elapsed: "elapsed"),
            log: .preparing(holds: lines.holds), problems: [.init(.microphone, began: 3)], status: .gettingReady,
            anchors: .init(sealed: [id: .init(id: 12, start: 2)]), nextDisplayID: 13,
            text: .init(sealed: [id: text]), lines: lines,
            rendered: .init(prepared: true, ordered: [id], inSealedRows: 1,
                            entries: .init(sealed: [id: entry]),
                            locations: .init(sealed: [id: .init(row: 0, lateEntry: 0)])),
            work: .init(entryOrderComparisons: 17, rowsBuilt: 19)
        )
        #expect(state.banners == [.init(kind: .microphone, time: "banner")])
        #expect(state.recording == .on(elapsed: "elapsed"))
        #expect(state.log == .preparing(holds: lines.holds))
        #expect(state.problems == [.init(.microphone, began: 3)])
        #expect(state.status == .gettingReady)
        #expect(state.anchors.sealed[id] == .init(id: 12, start: 2))
        #expect(state.nextDisplayID == 13)
        #expect(state.text.sealed[id] == text)
        #expect(state.lines == lines)
        #expect(state.lines.layout == 7)
        #expect(state.lines.entries == [entry])
        #expect(state.entryCount == 1)
        #expect(state.rendered.prepared)
        #expect(state.rendered.ordered == [id])
        #expect(state.rendered.inSealedRows == 1)
        #expect(state.rendered.entries.sealed[id] == entry)
        #expect(state.rendered.locations.sealed[id] == .init(row: 0, lateEntry: 0))
        #expect(state.work.entryOrderComparisons == 17)
        #expect(state.work.rowsBuilt == 19)
    }

    @Test func logIsStoredUntilReduction() {
        var state = makeState()
        state.status = .gettingReady
        state.recording = .on(elapsed: "given")
        state.lines.holds = [.init(entryID: 1, text: "held")]
        #expect(state.log == .empty)
        assert(state, .jumpToLive, delivers: nil) {
            $0.log = .preparing(holds: $0.lines.holds)
        }
    }

    @Test func equalityIgnoresIndexesAndWorkButObservesStoredLog() {
        let state = makeState()
        var other = state
        other.rendered.prepared = true
        other.rendered.ordered = [.init(speaker: .mine, localID: 3)]
        other.rendered.inSealedRows = 2
        other.rendered.entries = [.init(speaker: .mine, localID: 3): .init(id: 4, time: "given", speaker: .mine)]
        other.rendered.locations = [.init(speaker: .mine, localID: 3): .init(row: 0)]
        other.work.entryOrderComparisons = 31
        other.work.rowsBuilt = 29
        other.lines.layout = 8
        #expect(state == other)
        other.log = .preparing(holds: [])
        #expect(state != other)
    }

    @Test func finalPrefixDistinguishesOtherwiseEqualText() {
        let id = ReadingTextUpdate.Entry.ID(speaker: .mine, localID: 1)
        var state = makeState()
        state.text[id] = .init(id: id, start: 0, end: 1)
        var final = state
        final.text.seal(id)
        #expect(state.text == final.text)
        #expect(state != final)
    }
}

private func makeState() -> ReadingState { .init() }
