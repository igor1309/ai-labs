import Testing
@testable import Reading

struct ReadingIncrementalTests {

    @Test(arguments: [20, 800], [false, true])
    func newestRevisionBuildsOneRowWithoutOrdering(precedingCount: Int, late: Bool) {

        let entries = (0...precedingCount).map { segment($0, at: Double($0), pending: "draft", late: late) }
        let state = applying(.textUpdated(update(entries)))
        var revised = entries
        revised[precedingCount] = segment(precedingCount, at: Double(precedingCount), settled: "settled", late: late)
        let result = ReadingReducer.reduce(state, .textUpdated(update(revised))).0

        #expect(result.work.entryOrderComparisons == 0)
        #expect(result.work.rowsBuilt == 1)
        #expect(result.lines.entries.dropLast() == state.lines.entries.dropLast())
        #expect(result.lines.entries.last?.settled == "settled")
    }

    @Test func insertingBeforeAndAtTheSameAnchorKeepsOrder() { assert(initial, .textUpdated(update([middle, first, last, sameTime])), reducedTo: inserted) }
    @Test func insertingBeforeAndAtTheSameAnchorKeepsOrderHasNoEffect() { assert(initial, .textUpdated(update([middle, first, last, sameTime])), effect: nil) }
    @Test func problemsSplitLateGroupsWithoutRebuildingEntries() { assert(lateInitial, .problemsChanged([gap]), reducedTo: split) }
    @Test func problemsSplitLateGroupsWithoutRebuildingEntriesHasNoEffect() { assert(lateInitial, .problemsChanged([gap]), effect: nil) }
    @Test func recordingOffJoinsLateGroupsAcrossRemovedGaps() { assert(cachedSplit, .recordingChanged(.off), reducedTo: stopped) }
    @Test func recordingOffJoinsLateGroupsAcrossRemovedGapsHasNoEffect() { assert(cachedSplit, .recordingChanged(.off), effect: nil) }
    @Test func listeningOmissionJoinsLateGroups() { assert(cachedSeparated, .textUpdated(update([first, last])), reducedTo: omitted) }
    @Test func listeningOmissionJoinsLateGroupsHasNoEffect() { assert(cachedSeparated, .textUpdated(update([first, last])), effect: nil) }
    @Test func entryJoiningLateGroupMergesNeighbours() { assert(cachedSeparated, .textUpdated(update([first, middleLate, last])), reducedTo: merged) }
    @Test func entryJoiningLateGroupMergesNeighboursHasNoEffect() { assert(cachedSeparated, .textUpdated(update([first, middleLate, last])), effect: nil) }
    @Test func entryLeavingLateGroupSplitsNeighbours() { assert(cachedMerged, .textUpdated(update([first, middle, last])), reducedTo: separated) }
    @Test func entryLeavingLateGroupSplitsNeighboursHasNoEffect() { assert(cachedMerged, .textUpdated(update([first, middle, last])), effect: nil) }
    @Test func revisedEndCanShortenLateSpan() { assert(cachedJoined, .textUpdated(update([shorterFirst, middleLate, last, sameTime])), reducedTo: shortened) }
    @Test func revisedEndCanShortenLateSpanHasNoEffect() { assert(cachedJoined, .textUpdated(update([shorterFirst, middleLate, last, sameTime])), effect: nil) }
    @Test func revisedEndCanLengthenLateSpan() { assert(cachedJoined, .textUpdated(update([first, middleLate, longerLast, sameTime])), reducedTo: lengthened) }
    @Test func revisedEndCanLengthenLateSpanHasNoEffect() { assert(cachedJoined, .textUpdated(update([first, middleLate, longerLast, sameTime])), effect: nil) }
    @Test func revisionKeepsItsAnchorDespiteTimingChange() { assert(cachedInserted, .textUpdated(update([first, movedMiddle, last, sameTime])), reducedTo: revisedInPlace) }
    @Test func revisionKeepsItsAnchorDespiteTimingChangeHasNoEffect() { assert(cachedInserted, .textUpdated(update([first, movedMiddle, last, sameTime])), effect: nil) }
    @Test func revisionInsideLateGroupKeepsOtherEntries() { assert(cachedSplit, .textUpdated(update([revisedFirst, last])), reducedTo: revisedSplit) }
    @Test func revisionInsideLateGroupKeepsOtherEntriesHasNoEffect() { assert(cachedSplit, .textUpdated(update([revisedFirst, last])), effect: nil) }
    @Test func multipleRevisionsInsideOneGroupAreKept() { assert(lateInitial, .textUpdated(update([revisedFirst, revisedLast])), reducedTo: revisedLate) }
    @Test func multipleRevisionsInsideOneGroupAreKeptHasNoEffect() { assert(lateInitial, .textUpdated(update([revisedFirst, revisedLast])), effect: nil) }
    @Test func insertionAtGapTimeFollowsTheGap() { assert(cachedSplit, .textUpdated(update([first, atGap, last])), reducedTo: insertedAtGap) }
    @Test func insertionAtGapTimeFollowsTheGapHasNoEffect() { assert(cachedSplit, .textUpdated(update([first, atGap, last])), effect: nil) }

    @Test func unchangedUpdateBuildsNoRows() { expectWork(cachedJoined, .textUpdated(update([sameTime, last, middleLate, first])), rowsBuilt: 0) }
    @Test func problemsReuseEntryRows() { expectWork(lateInitial, .problemsChanged([gap]), rowsBuilt: 0) }
    @Test func stoppingReusesEntryRows() { expectWork(cachedSplit, .recordingChanged(.off), rowsBuilt: 0) }
    @Test func omissionReusesRemainingRows() { expectWork(cachedInserted, .textUpdated(update([first, last, sameTime])), rowsBuilt: 0) }
    @Test func joiningBuildsOnlyTheChangedEntry() { expectWork(cachedInserted, .textUpdated(update([first, middleLate, last, sameTime])), rowsBuilt: 1) }
    @Test func leavingBuildsOnlyTheChangedEntry() { expectWork(cachedJoined, .textUpdated(update([first, middle, last, sameTime])), rowsBuilt: 1) }
    @Test func lateRevisionBuildsOnlyTheChangedEntry() { expectWork(cachedSplit, .textUpdated(update([revisedFirst, last])), rowsBuilt: 1) }
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
private let initial = applying(.textUpdated(update([first, last])), to: applying(.recordingChanged(.on(elapsed: 20))))
private let lateInitial = initial
private let cachedSeparated = applying(.textUpdated(update([first, middle, last])), to: initial)
private let cachedMerged = applying(.textUpdated(update([first, middleLate, last])), to: cachedSeparated)
private let cachedInserted = applying(.textUpdated(update([middle, first, last, sameTime])), to: initial)
private let cachedSplit = applying(.problemsChanged([gap]), to: initial)
private let cachedJoined = applying(.textUpdated(update([first, middleLate, last, sameTime])), to: cachedInserted)

private let inserted = fixture([first, last, middle, sameTime], rows: [
    late("00:02–00:12", [firstRow]), .entry(middleRow), .entry(sameTimeRow), late("00:06–00:07", [lastRow]),
])
private let split = fixture([first, last], problems: [gap], rows: [
    late("00:02–00:12", [firstRow]), gapRow, late("00:06–00:07", [lastRow]),
])
private let stopped = fixture([first, last], rows: [late("00:02–00:12", [firstRow, lastRow])], recording: .off)
private let omitted = fixture([first, last], next: 3, rows: [late("00:02–00:12", [firstRow, lastRow])])
private let separated = fixture([first, last, middle], rows: [
    late("00:02–00:12", [firstRow]), .entry(middleRow), late("00:06–00:07", [lastRow]),
])
private let merged = fixture([first, last, middleLate], rows: [late("00:02–00:12", [firstRow, middleRow, lastRow])])
private let shortened = fixture([shorterFirst, last, middleLate, sameTime], rows: [
    late("00:02–00:05", [firstRow, middleRow]), .entry(sameTimeRow), late("00:06–00:07", [lastRow]),
])
private let lengthened = fixture([first, longerLast, middleLate, sameTime], rows: [
    late("00:02–00:12", [firstRow, middleRow]), .entry(sameTimeRow), late("00:06–00:15", [lastRow]),
])
private let revisedInPlace = fixture([first, last, movedMiddle, sameTime], anchorStarts: [2, 6, 4, 4], rows: [
    late("00:02–00:12", [firstRow]), .entry(shown(2, "00:04", settled: "revised")),
    .entry(sameTimeRow), late("00:06–00:07", [lastRow]),
])
private let revisedSplit = fixture([revisedFirst, last], problems: [gap], rows: [
    late("00:02–00:12", [shown(0, "00:02", settled: "revised")]), gapRow, late("00:06–00:07", [lastRow]),
])
private let revisedLate = fixture([revisedFirst, revisedLast], rows: [
    late("00:02–00:12", [shown(0, "00:02", settled: "revised"), shown(1, "00:06", settled: "revised last")]),
])
private let insertedAtGap = fixture([first, last, atGap], problems: [gap], rows: [
    late("00:02–00:12", [firstRow]), gapRow, late("00:04–00:07", [shown(2, "00:04"), lastRow]),
])

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

private func applying(_ event: ReadingEvent, to state: ReadingState = .init()) -> ReadingState {

    ReadingReducer.reduce(state, event).0
}

private func fixture(
    _ entries: [ReadingTextUpdate.Entry], anchorStarts: [Double]? = nil,
    next: Int? = nil, problems: [ReadingProblem] = [], rows: [ReadingState.Row],
    recording: ReadingState.Recording = .on(elapsed: "00:00:20")
) -> ReadingState {

    var state = ReadingState()
    state.status = .listening
    state.recording = recording
    state.problems = problems
    state.banners = problems.map { .init(kind: $0.kind, time: "00:04") }
    for (index, entry) in entries.enumerated() {
        state.anchors[entry.id] = .init(id: index, start: anchorStarts?[index] ?? entry.start)
        state.text[entry.id] = entry
    }
    state.nextDisplayID = next ?? entries.count
    state.lines.rows = rows
    return state
}

private func expectWork(
    _ state: ReadingState, _ event: ReadingEvent, rowsBuilt: Int, sourceLocation: SourceLocation = #_sourceLocation
) {

    let result = ReadingReducer.reduce(state, event).0
    #expect(result.work.entryOrderComparisons == 0, sourceLocation: sourceLocation)
    #expect(result.work.rowsBuilt == rowsBuilt, sourceLocation: sourceLocation)
}
