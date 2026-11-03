import Foundation
import Testing
import Reading

struct ReadingIncrementalTests {

    @Test(arguments: [20, 800], [false, true])
    func newestRevisionBuildsOneRowWithoutOrdering(precedingCount: Int, late: Bool) {

        let entries = (0...precedingCount).map { segment($0, at: Double($0), pending: "draft", late: late) }
        let shown = entries.enumerated().map {
            ReadingState.Entry(id: $0.offset, time: String(format: "%02d:%02d", $0.offset / 60, $0.offset % 60), speaker: .mine, pending: "draft")
        }
        let state = makeState(entries: entries, rows: late
                              ? [.late(.init(span: "given span", entries: shown))]
                              : shown.map(ReadingState.Row.entry))
        var revised = entries
        revised[precedingCount] = segment(precedingCount, at: Double(precedingCount), settled: "settled", late: late)
        let event = ReadingEvent.textUpdated(update(revised))
        assert(state, event, delivers: nil) {
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
        }
        expectWork(state, event, rowsBuilt: 1)
    }

    @Test func insertingBeforeAndAtTheSameAnchorKeepsOrder() {

        assert(makeInitial(), .textUpdated(update([middle, first, last, sameTime])), delivers: nil) {
            $0.text[middle.id] = middle
            $0.text[sameTime.id] = sameTime
            $0.anchors[middle.id] = .init(id: 2, start: 4)
            $0.anchors[sameTime.id] = .init(id: 3, start: 4)
            $0.nextDisplayID = 4
            $0.lines.rows = [late("00:02–00:12", [firstRow]), .entry(middleRow), .entry(sameTimeRow), late("00:06–00:07", [lastRow])]
            $0.log = .lines($0.lines)
        }
    }

    @Test func problemsSplitLateGroupsWithoutRebuildingEntries() {

        assert(makeInitial(), .problemsChanged([gap]), delivers: nil) {
            $0.problems = [gap]
            $0.banners = [.init(kind: .microphone, time: "00:04")]
            $0.lines.rows = [late("00:02–00:12", [firstRow]), gapRow, late("00:06–00:07", [lastRow])]
            $0.log = .lines($0.lines)
        }
    }

    @Test func recordingOffJoinsLateGroupsAcrossRemovedGaps() {

        assert(makeCachedSplit(), .recordingChanged(.off), delivers: nil) {
            $0.recording = .off
            $0.problems = []
            $0.banners = []
            $0.lines.rows = [late("00:02–00:12", [firstRow, lastRow])]
            $0.log = .lines($0.lines)
        }
    }

    @Test func listeningOmissionJoinsLateGroups() {

        assert(makeCachedSeparated(), .textUpdated(update([first, last])), delivers: nil) {
            $0.text[middle.id] = nil
            $0.anchors[middle.id] = nil
            $0.lines.rows = [late("00:02–00:12", [firstRow, lastRow])]
            $0.log = .lines($0.lines)
        }
    }

    @Test func entryJoiningLateGroupMergesNeighbours() {

        assert(makeCachedSeparated(), .textUpdated(update([first, middleLate, last])), delivers: nil) {
            $0.text[middle.id] = middleLate
            $0.lines.rows = [late("00:02–00:12", [firstRow, middleRow, lastRow])]
            $0.log = .lines($0.lines)
        }
    }

    @Test func entryLeavingLateGroupSplitsNeighbours() {

        assert(makeCachedMerged(), .textUpdated(update([first, middle, last])), delivers: nil) {
            $0.text[middle.id] = middle
            $0.lines.rows = [late("00:02–00:12", [firstRow]), .entry(middleRow), late("00:06–00:07", [lastRow])]
            $0.log = .lines($0.lines)
        }
    }

    @Test func revisedEndCanShortenLateSpan() {

        assert(makeCachedJoined(), .textUpdated(update([shorterFirst, middleLate, last, sameTime])), delivers: nil) {
            $0.text[first.id] = shorterFirst
            $0.lines.rows[0] = late("00:02–00:05", [firstRow, middleRow])
            $0.log = .lines($0.lines)
        }
    }

    @Test func revisedEndCanLengthenLateSpan() {

        assert(makeCachedJoined(), .textUpdated(update([first, middleLate, longerLast, sameTime])), delivers: nil) {
            $0.text[last.id] = longerLast
            $0.lines.rows[2] = late("00:06–00:15", [lastRow])
            $0.log = .lines($0.lines)
        }
    }

    @Test func revisionKeepsItsAnchorDespiteTimingChange() {

        assert(makeCachedInserted(), .textUpdated(update([first, movedMiddle, last, sameTime])), delivers: nil) {
            $0.text[middle.id] = movedMiddle
            $0.lines.rows[1] = .entry(shown(2, "00:04", settled: "revised"))
            $0.log = .lines($0.lines)
        }
    }

    @Test func revisionInsideLateGroupKeepsOtherEntries() {

        assert(makeCachedSplit(), .textUpdated(update([revisedFirst, last])), delivers: nil) {
            $0.text[first.id] = revisedFirst
            $0.lines.rows[0] = late("00:02–00:12", [shown(0, "00:02", settled: "revised")])
            $0.log = .lines($0.lines)
        }
    }

    @Test func multipleRevisionsInsideOneGroupAreKept() {

        assert(makeInitial(), .textUpdated(update([revisedFirst, revisedLast])), delivers: nil) {
            $0.text[first.id] = revisedFirst
            $0.text[last.id] = revisedLast
            $0.lines.rows[0] = late("00:02–00:12", [shown(0, "00:02", settled: "revised"), shown(1, "00:06", settled: "revised last")])
            $0.log = .lines($0.lines)
        }
    }

    @Test func insertionAtGapTimeFollowsTheGap() {

        assert(makeCachedSplit(), .textUpdated(update([first, atGap, last])), delivers: nil) {
            $0.text[atGap.id] = atGap
            $0.anchors[atGap.id] = .init(id: 2, start: 4)
            $0.nextDisplayID = 3
            $0.lines.rows[2] = late("00:04–00:07", [shown(2, "00:04"), lastRow])
            $0.log = .lines($0.lines)
        }
    }

    @Test func tailOmissionRetainsTheFinalPrefix() {

        let state = makeFinalPrefix()
        let omitted = segment(2, at: 2)
        let remaining = segment(3, at: 3)
        let event = ReadingEvent.textUpdated(.init(status: .listening, entries: [remaining], from: 2, finalCount: 2))
        assert(state, event, delivers: nil) {
            $0.text[omitted.id] = nil
            $0.anchors[omitted.id] = nil
            $0.lines.rows.remove(at: 2)
            $0.log = .lines($0.lines)
        }
        expectWork(state, event, rowsBuilt: 0)
        let result = ReadingReducer.reduce(state, event).0
        #expect(result.text.sealed == state.text.sealed)
        #expect(result.lines.rows.sealed == state.lines.rows.sealed)
        #expect(result.rendered.inSealedRows == 2)
        #expect(result.entryCount == 3)
    }

    @Test func unchangedUpdateBuildsNoRows() { expectWork(makeCachedJoined(), .textUpdated(update([sameTime, last, middleLate, first])), rowsBuilt: 0) }
    @Test func problemsReuseEntryRows() { expectWork(makeInitial(), .problemsChanged([gap]), rowsBuilt: 0) }
    @Test func stoppingReusesEntryRows() { expectWork(makeCachedSplit(), .recordingChanged(.off), rowsBuilt: 0) }
    @Test func omissionReusesRemainingRows() { expectWork(makeCachedInserted(), .textUpdated(update([first, last, sameTime])), rowsBuilt: 0) }
    @Test func joiningBuildsOnlyTheChangedEntry() { expectWork(makeCachedInserted(), .textUpdated(update([first, middleLate, last, sameTime])), rowsBuilt: 1) }
    @Test func leavingBuildsOnlyTheChangedEntry() { expectWork(makeCachedJoined(), .textUpdated(update([first, middle, last, sameTime])), rowsBuilt: 1) }
    @Test func lateRevisionBuildsOnlyTheChangedEntry() { expectWork(makeCachedSplit(), .textUpdated(update([revisedFirst, last])), rowsBuilt: 1) }
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

private let firstRow = shown(0, "00:02")
private let lastRow = shown(1, "00:06")
private let middleRow = shown(2, "00:04")
private let sameTimeRow = shown(3, "00:04")
private let gapRow = ReadingState.Row.gap(.init(speaker: .mine, time: "00:04", kind: .microphone))
private func makeInitial() -> ReadingState {

    makeState(entries: [first, last], rows: [late("00:02–00:12", [firstRow, lastRow])])
}

private func makeCachedSeparated() -> ReadingState {

    makeState(entries: [first, last, middle], rows: [
        late("00:02–00:12", [firstRow]), .entry(middleRow), late("00:06–00:07", [lastRow]),
    ])
}

private func makeCachedMerged() -> ReadingState {

    makeState(entries: [first, last, middleLate], rows: [late("00:02–00:12", [firstRow, middleRow, lastRow])])
}

private func makeCachedInserted() -> ReadingState {

    makeState(entries: [first, last, middle, sameTime], rows: [
        late("00:02–00:12", [firstRow]), .entry(middleRow), .entry(sameTimeRow), late("00:06–00:07", [lastRow]),
    ])
}

private func makeCachedSplit() -> ReadingState {

    makeState(entries: [first, last], rows: [late("00:02–00:12", [firstRow]), gapRow, late("00:06–00:07", [lastRow])],
              problems: [gap], banners: [.init(kind: .microphone, time: "00:04")])
}

private func makeCachedJoined() -> ReadingState {

    makeState(entries: [first, last, middleLate, sameTime], rows: [
        late("00:02–00:12", [firstRow, middleRow]), .entry(sameTimeRow), late("00:06–00:07", [lastRow]),
    ])
}

private func makeFinalPrefix() -> ReadingState {

    var state = makeState(entries: (0..<4).map { segment($0, at: Double($0)) }, rows: [
        .entry(shown(0, "00:00")), .entry(shown(1, "00:01")),
        .entry(shown(2, "00:02")), .entry(shown(3, "00:03")),
    ])
    for id in 0..<2 {
        let key = ReadingTextUpdate.Entry.ID(speaker: .mine, localID: id)
        state.text.seal(key)
        state.anchors.seal(key)
        state.rendered.entries.seal(key)
        state.rendered.locations.seal(key)
    }
    state.lines.rows.seal(upTo: 2)
    state.rendered.inSealedRows = 2
    state.log = .lines(state.lines)
    return state
}

private func makeState(
    entries: [ReadingTextUpdate.Entry], rows: [ReadingState.Row],
    problems: [ReadingProblem] = [], banners: [ReadingState.Banner] = []
) -> ReadingState {

    let lines = ReadingState.Lines(rows: .init(tail: rows))
    var state = ReadingState(banners: banners, recording: .on(elapsed: "00:00:20"), log: .lines(lines),
                             problems: problems, status: .listening, nextDisplayID: entries.count,
                             lines: lines, rendered: .init(prepared: true))
    for entry in entries {
        state.text[entry.id] = entry
        state.anchors[entry.id] = .init(id: entry.id.localID, start: entry.start)
    }
    let keys = Dictionary(uniqueKeysWithValues: entries.map { ($0.id.localID, $0.id) })
    func cache(_ entry: ReadingState.Entry, row: Int, lateEntry: Int? = nil) {

        let key = keys[entry.id]!
        state.rendered.ordered.append(key)
        state.rendered.entries[key] = entry
        state.rendered.locations[key] = .init(row: row, lateEntry: lateEntry)
    }
    for (row, value) in rows.enumerated() {
        switch value {
        case let .entry(entry): cache(entry, row: row)
        case let .late(group):
            for (index, entry) in group.entries.enumerated() { cache(entry, row: row, lateEntry: index) }
        case .gap: break
        }
    }
    return state
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

private func expectWork(
    _ state: ReadingState, _ event: ReadingEvent, rowsBuilt: Int, sourceLocation: SourceLocation = #_sourceLocation
) {

    let result = ReadingReducer.reduce(state, event).0
    #expect(result.work.entryOrderComparisons == 0, sourceLocation: sourceLocation)
    #expect(result.work.rowsBuilt == rowsBuilt, sourceLocation: sourceLocation)
}
