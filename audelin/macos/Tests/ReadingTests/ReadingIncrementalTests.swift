import Foundation
import Testing
import Reading

struct ReadingIncrementalTests {

    @Test(arguments: [20, 800], [false, true])
    func newestRevisionBuildsOneRowWithoutOrdering(precedingCount: Int, late: Bool) {

        let spy = RenderingSpy()
        let entries = (0...precedingCount).map { segment($0, at: Double($0), pending: "draft", late: late) }
        let shown = entries.enumerated().map {
            ReadingState.Entry(id: $0.offset, time: "line(\(Double($0.offset)))", speaker: .mine, pending: "draft")
        }
        let state = makeListening(entries: entries, rows: late
                              ? [.late(.init(span: "given span", entries: shown))]
                              : shown.map(ReadingState.Row.entry))
        var revised = entries
        revised[precedingCount] = segment(precedingCount, at: Double(precedingCount), settled: "settled", late: late)
        let event = ReadingEvent.textUpdated(update(revised))
        assert(state, event, delivers: nil, using: makeReducer(spy)) {
            $0.text[revised[precedingCount].id] = revised[precedingCount]
            if late, case var .late(group) = $0.lines.rows[0] {
                group.entries[precedingCount].settled = "settled"
                group.entries[precedingCount].pending = ""
                $0.lines.rows[0] = .late(group)
            } else if case var .entry(entry) = $0.lines.rows[precedingCount] {
                entry.settled = "settled"
                entry.pending = ""
                $0.lines.rows[precedingCount] = .entry(entry)
            }
            $0.log = .lines($0.lines)
            $0.rendered.entries[revised[precedingCount].id]?.settled = "settled"
            $0.rendered.entries[revised[precedingCount].id]?.pending = ""
        }
        #expect(spy.calls == [.line(Double(precedingCount))])
    }

    @Test func insertingBeforeAndAtTheSameAnchorKeepsOrder() {

        let spy = RenderingSpy()
        assert(makeInitial(), .textUpdated(update([middle, first, last, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = middle
            $0.text[sameTime.id] = sameTime
            $0.anchors[middle.id] = .init(id: 2, start: 4)
            $0.anchors[sameTime.id] = .init(id: 3, start: 4)
            $0.nextDisplayID = 4
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow]), .entry(middleRow), .entry(sameTimeRow), late("span[line(6.0)|line(7.0)]", [lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.ordered = [first.id, middle.id, sameTime.id, last.id]
            $0.rendered.entries[middle.id] = middleRow
            $0.rendered.entries[sameTime.id] = sameTimeRow
            $0.rendered.locations[middle.id] = .init(row: 1)
            $0.rendered.locations[sameTime.id] = .init(row: 2)
            $0.rendered.locations[last.id] = .init(row: 3, lateEntry: 0)
        }
        #expect(spy.calls == [.line(4), .line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(6),
                             .line(7), .span("line(6.0)", "line(7.0)")])
    }

    @Test func problemsSplitLateGroupsWithoutRebuildingEntries() {

        let spy = RenderingSpy()
        assert(makeInitial(), .problemsChanged([gap]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.problems = [gap]
            $0.banners = [.init(kind: .microphone, time: "line(4.0)")]
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow]), gapRow, late("span[line(6.0)|line(7.0)]", [lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.locations[last.id] = .init(row: 2, lateEntry: 0)
        }
        #expect(spy.calls == [.line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(4), .line(6),
                             .line(7), .span("line(6.0)", "line(7.0)")])
    }

    @Test func recordingOffJoinsLateGroupsAcrossRemovedGaps() {

        let spy = RenderingSpy()
        assert(makeCachedSplit(), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.recording = .off
            $0.problems = []
            $0.banners = []
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow, lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.locations[last.id] = .init(row: 0, lateEntry: 1)
        }
        #expect(spy.calls == [.line(2), .line(12), .span("line(2.0)", "line(12.0)")])
    }

    @Test func listeningOmissionJoinsLateGroups() {

        let spy = RenderingSpy()
        assert(makeCachedSeparated(), .textUpdated(update([first, last])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = nil
            $0.anchors[middle.id] = nil
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow, lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.ordered = [first.id, last.id]
            $0.rendered.entries[middle.id] = nil
            $0.rendered.locations[middle.id] = nil
            $0.rendered.locations[last.id] = .init(row: 0, lateEntry: 1)
        }
        #expect(spy.calls == [.line(2), .line(12), .span("line(2.0)", "line(12.0)")])
    }

    @Test func entryJoiningLateGroupMergesNeighbours() {

        let spy = RenderingSpy()
        assert(makeCachedSeparated(), .textUpdated(update([first, middleLate, last])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = middleLate
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow, middleRow, lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.locations[middle.id] = .init(row: 0, lateEntry: 1)
            $0.rendered.locations[last.id] = .init(row: 0, lateEntry: 2)
        }
        #expect(spy.calls == [.line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)")])
    }

    @Test func entryLeavingLateGroupSplitsNeighbours() {

        let spy = RenderingSpy()
        assert(makeCachedMerged(), .textUpdated(update([first, middle, last])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = middle
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow]), .entry(middleRow), late("span[line(6.0)|line(7.0)]", [lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.locations[middle.id] = .init(row: 1)
            $0.rendered.locations[last.id] = .init(row: 2, lateEntry: 0)
        }
        #expect(spy.calls == [.line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(6), .line(7),
                             .span("line(6.0)", "line(7.0)")])
    }

    @Test func revisedEndCanShortenLateSpan() {

        let spy = RenderingSpy()
        assert(makeCachedJoined(), .textUpdated(update([shorterFirst, middleLate, last, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[first.id] = shorterFirst
            $0.lines.rows[0] = late("span[line(2.0)|line(5.0)]", [firstRow, middleRow])
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(2), .line(2), .line(5), .span("line(2.0)", "line(5.0)"), .line(6), .line(7),
                             .span("line(6.0)", "line(7.0)")])
    }

    @Test func revisedEndCanLengthenLateSpan() {

        let spy = RenderingSpy()
        assert(makeCachedJoined(), .textUpdated(update([first, middleLate, longerLast, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[last.id] = longerLast
            $0.lines.rows[2] = late("span[line(6.0)|line(15.0)]", [lastRow])
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(6), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(6), .line(15),
                             .span("line(6.0)", "line(15.0)")])
    }

    @Test func revisionKeepsItsAnchorDespiteTimingChange() {

        let spy = RenderingSpy()
        assert(makeCachedInserted(), .textUpdated(update([first, movedMiddle, last, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = movedMiddle
            $0.lines.rows[1] = .entry(shown(2, "line(4.0)", settled: "revised"))
            $0.log = .lines($0.lines)
            $0.rendered.entries[middle.id]?.settled = "revised"
        }
        #expect(spy.calls == [.line(4)])
    }

    @Test func revisionInsideLateGroupKeepsOtherEntries() {

        let spy = RenderingSpy()
        assert(makeCachedSplit(), .textUpdated(update([revisedFirst, last])), delivers: nil, using: makeReducer(spy)) {
            $0.text[first.id] = revisedFirst
            $0.lines.rows[0] = late("span[line(2.0)|line(12.0)]", [shown(0, "line(2.0)", settled: "revised")])
            $0.log = .lines($0.lines)
            $0.rendered.entries[first.id]?.settled = "revised"
        }
        #expect(spy.calls == [.line(2)])
    }

    @Test func multipleRevisionsInsideOneGroupAreKept() {

        let spy = RenderingSpy()
        assert(makeInitial(), .textUpdated(update([revisedFirst, revisedLast])), delivers: nil, using: makeReducer(spy)) {
            $0.text[first.id] = revisedFirst
            $0.text[last.id] = revisedLast
            $0.lines.rows[0] = late("span[line(2.0)|line(12.0)]", [shown(0, "line(2.0)", settled: "revised"), shown(1, "line(6.0)", settled: "revised last")])
            $0.log = .lines($0.lines)
            $0.rendered.entries[first.id]?.settled = "revised"
            $0.rendered.entries[last.id]?.settled = "revised last"
        }
        #expect(spy.calls == [.line(2), .line(6)])
    }

    @Test func insertionAtGapTimeFollowsTheGap() {

        let spy = RenderingSpy()
        assert(makeCachedSplit(), .textUpdated(update([first, atGap, last])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[atGap.id] = atGap
            $0.anchors[atGap.id] = .init(id: 2, start: 4)
            $0.nextDisplayID = 3
            $0.lines.rows[2] = late("span[line(4.0)|line(7.0)]", [shown(2, "line(4.0)"), lastRow])
            $0.log = .lines($0.lines)
            $0.rendered.ordered = [first.id, atGap.id, last.id]
            $0.rendered.entries[atGap.id] = shown(2, "line(4.0)")
            $0.rendered.locations[atGap.id] = .init(row: 2, lateEntry: 0)
            $0.rendered.locations[last.id] = .init(row: 2, lateEntry: 1)
        }
        #expect(spy.calls == [.line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(4), .line(4),
                             .line(7), .span("line(4.0)", "line(7.0)")])
    }

    @Test func tailOmissionRetainsTheFinalPrefix() {

        let spy = RenderingSpy()
        let omitted = segment(2, at: 2)
        let remaining = segment(3, at: 3)
        assert(makeFinalPrefix(), .textUpdated(.init(status: .listening, entries: [remaining], from: 2, finalCount: 2)),
               delivers: nil, using: makeReducer(spy)) {
            $0.text[omitted.id] = nil
            $0.anchors[omitted.id] = nil
            $0.lines.rows.remove(at: 2)
            $0.log = .lines($0.lines)
            $0.rendered.ordered.removeAll { $0 == omitted.id }
            $0.rendered.entries[omitted.id] = nil
            $0.rendered.locations[omitted.id] = nil
            $0.rendered.locations[remaining.id] = .init(row: 2)
        }
        #expect(spy.calls == [])
    }

    @Test func unchangedUpdateChangesNothing() {

        let spy = RenderingSpy()
        assert(makeCachedJoined(), .textUpdated(update([sameTime, last, middleLate, first])), delivers: nil, using: makeReducer(spy)) { _ in }
        #expect(spy.calls == [])
    }

    @Test func omissionKeepsTheRemainingRows() {

        let spy = RenderingSpy()
        assert(makeCachedInserted(), .textUpdated(update([first, last, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = nil
            $0.anchors[middle.id] = nil
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow]), .entry(sameTimeRow), late("span[line(6.0)|line(7.0)]", [lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.ordered = [first.id, sameTime.id, last.id]
            $0.rendered.entries[middle.id] = nil
            $0.rendered.locations[middle.id] = nil
            $0.rendered.locations[sameTime.id] = .init(row: 1)
            $0.rendered.locations[last.id] = .init(row: 2, lateEntry: 0)
        }
        #expect(spy.calls == [.line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(6), .line(7),
                             .span("line(6.0)", "line(7.0)")])
    }

    @Test func joiningMovesOnlyTheChangedEntry() {

        let spy = RenderingSpy()
        assert(makeCachedInserted(), .textUpdated(update([first, middleLate, last, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = middleLate
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow, middleRow]), .entry(sameTimeRow), late("span[line(6.0)|line(7.0)]", [lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.locations[middle.id] = .init(row: 0, lateEntry: 1)
            $0.rendered.locations[sameTime.id] = .init(row: 1)
            $0.rendered.locations[last.id] = .init(row: 2, lateEntry: 0)
        }
        #expect(spy.calls == [.line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(6), .line(7),
                             .span("line(6.0)", "line(7.0)")])
    }

    @Test func leavingMovesOnlyTheChangedEntry() {

        let spy = RenderingSpy()
        assert(makeCachedJoined(), .textUpdated(update([first, middle, last, sameTime])), delivers: nil, using: makeReducer(spy)) {
            $0.text[middle.id] = middle
            $0.lines.rows = [late("span[line(2.0)|line(12.0)]", [firstRow]), .entry(middleRow), .entry(sameTimeRow), late("span[line(6.0)|line(7.0)]", [lastRow])]
            $0.log = .lines($0.lines)
            $0.rendered.locations[middle.id] = .init(row: 1)
            $0.rendered.locations[sameTime.id] = .init(row: 2)
            $0.rendered.locations[last.id] = .init(row: 3, lateEntry: 0)
        }
        #expect(spy.calls == [.line(4), .line(2), .line(12), .span("line(2.0)", "line(12.0)"), .line(6), .line(7),
                             .span("line(6.0)", "line(7.0)")])
    }
}

private let first = segment(0, at: 2, end: 12, late: true)
private let middle = segment(2, at: 4)
private let middleLate = segment(2, at: 4, late: true)
private let last = segment(1, at: 6, late: true)
private let sameTime = segment(3, at: 4)
private let gap = ReadingProblem(.microphone, began: 4)
private let shorterFirst = segment(0, at: 2, end: 3, late: true)
private let longerLast = segment(1, at: 6, end: 15, late: true)
private let movedMiddle = segment(2, at: 99, settled: "revised")
private let revisedFirst = segment(0, at: 2, end: 12, settled: "revised", late: true)
private let revisedLast = segment(1, at: 6, settled: "revised last", late: true)
private let atGap = segment(4, at: 4, late: true)

private let firstRow = shown(0, "line(2.0)")
private let lastRow = shown(1, "line(6.0)")
private let middleRow = shown(2, "line(4.0)")
private let sameTimeRow = shown(3, "line(4.0)")
private let gapRow = ReadingState.Row.gap(.init(speaker: .mine, time: "line(4.0)", kind: .microphone))
private func makeInitial() -> ReadingState {

    makeListening(entries: [first, last], rows: [late("span[line(2.0)|line(12.0)]", [firstRow, lastRow])])
}

private func makeCachedSeparated() -> ReadingState {

    makeListening(entries: [first, last, middle], rows: [
        late("span[line(2.0)|line(12.0)]", [firstRow]), .entry(middleRow), late("span[line(6.0)|line(7.0)]", [lastRow]),
    ])
}

private func makeCachedMerged() -> ReadingState {

    makeListening(entries: [first, last, middleLate], rows: [late("span[line(2.0)|line(12.0)]", [firstRow, middleRow, lastRow])])
}

private func makeCachedInserted() -> ReadingState {

    makeListening(entries: [first, last, middle, sameTime], rows: [
        late("span[line(2.0)|line(12.0)]", [firstRow]), .entry(middleRow), .entry(sameTimeRow), late("span[line(6.0)|line(7.0)]", [lastRow]),
    ])
}

private func makeCachedSplit() -> ReadingState {

    makeListening(entries: [first, last], rows: [late("span[line(2.0)|line(12.0)]", [firstRow]), gapRow, late("span[line(6.0)|line(7.0)]", [lastRow])],
              problems: [gap], banners: [.init(kind: .microphone, time: "line(4.0)")])
}

private func makeCachedJoined() -> ReadingState {

    makeListening(entries: [first, last, middleLate, sameTime], rows: [
        late("span[line(2.0)|line(12.0)]", [firstRow, middleRow]), .entry(sameTimeRow), late("span[line(6.0)|line(7.0)]", [lastRow]),
    ])
}

private func makeFinalPrefix() -> ReadingState {

    makeListening(entries: (0..<4).map { segment($0, at: Double($0)) }, rows: [
        .entry(shown(0, "line(0.0)")), .entry(shown(1, "line(1.0)")),
        .entry(shown(2, "line(2.0)")), .entry(shown(3, "line(3.0)")),
    ], sealed: 2)
}

private func segment(
    _ id: Int, at start: Double, end: Double? = nil, settled: String = "", pending: String = "", late: Bool = false
) -> ReadingTextUpdate.Entry {

    .init(id: .init(speaker: .mine, localID: id), start: start, end: end ?? start + 1,
          settled: settled, pending: pending, writtenLater: late)
}

private func shown(_ id: Int, _ time: String, settled: String = "") -> ReadingState.Entry {

    .init(id: id, time: time, speaker: .mine, settled: settled, pending: "")
}

private func late(_ span: String, _ entries: [ReadingState.Entry]) -> ReadingState.Row {

    .late(.init(span: span, entries: entries))
}

private func update(_ entries: [ReadingTextUpdate.Entry]) -> ReadingTextUpdate {

    .init(status: .listening, entries: entries)
}
