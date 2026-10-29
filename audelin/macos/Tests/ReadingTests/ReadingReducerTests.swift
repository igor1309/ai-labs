@testable import Reading
import Testing

struct ReadingReducerTests {

    @Test func recordingOnShowsElapsedTime() { assert(.init(), .recordingChanged(.on(elapsed: 3_661.9)), reducedTo: recording(.on(elapsed: "01:01:01"))) }
    @Test func recordingOnHasNoEffect() { assert(.init(), .recordingChanged(.on(elapsed: 3_661.9)), effect: nil) }

    @Test func recordingOffClearsElapsedTime() { assert(recording(.on(elapsed: "00:00:12")), .recordingChanged(.off), reducedTo: .init()) }
    @Test func recordingOffHasNoEffect() { assert(recording(.on(elapsed: "00:00:12")), .recordingChanged(.off), effect: nil) }

    @Test func listeningTextBecomesARow() { assert(.init(), .textUpdated(listening(entry)), reducedTo: read(entry)) }
    @Test func listeningTextHasNoEffect() { assert(.init(), .textUpdated(listening(entry)), effect: nil) }

    @Test func holdAddsAHold() { assert(.init(), .hold(held), reducedTo: lines { $0.holds = [held] }) }
    @Test func holdHasNoEffect() { assert(.init(), .hold(held), effect: nil) }

    @Test func letGoRemovesTheHold() { assert(lines { $0.holds = [held] }, .letGo(held), reducedTo: .init()) }
    @Test func letGoHasNoEffect() { assert(lines { $0.holds = [held] }, .letGo(held), effect: nil) }

    @Test func scrollingUpStopsFollowing() { assert(.init(), .scrolled(atBottom: false), reducedTo: lines { $0.followsLive = false }) }
    @Test func scrollingUpHasNoEffect() { assert(.init(), .scrolled(atBottom: false), effect: nil) }

    @Test func scrollingToBottomFollowsAndClearsNew() { assert(behind, .scrolled(atBottom: true), reducedTo: .init()) }
    @Test func scrollingToBottomHasNoEffect() { assert(behind, .scrolled(atBottom: true), effect: nil) }

    @Test func jumpToLiveFollowsAndClearsNew() { assert(behind, .jumpToLive, reducedTo: .init()) }
    @Test func jumpToLiveHasNoEffect() { assert(behind, .jumpToLive, effect: nil) }

    @Test func callOrderGivesEachSpeakerItsOwnRow() { assert(.init(), .textUpdated(listening(draft, first)), reducedTo: called) }
    @Test func callOrderHasNoEffect() { assert(.init(), .textUpdated(listening(draft, first)), effect: nil) }

    @Test func settlingKeepsIDsTimesAndOrder() { assert(called, .textUpdated(listening(firm, first)), reducedTo: settledInPlace) }
    @Test func settlingHasNoEffect() { assert(called, .textUpdated(listening(firm, first)), effect: nil) }

    @Test func recordingRestartShowsZero() { assert(recording(.on(elapsed: "01:01:01")), .recordingChanged(.on(elapsed: 0)), reducedTo: recording(.on(elapsed: "00:00:00"))) }
    @Test func recordingRestartHasNoEffect() { assert(recording(.on(elapsed: "01:01:01")), .recordingChanged(.on(elapsed: 0)), effect: nil) }

    @Test func consecutiveLateEntriesGroupInCallOrder() { assert(.init(), .textUpdated(listening(late4, on3, late2, late1, early)), reducedTo: lateGroups) }
    @Test func lateEntriesHaveNoEffect() { assert(.init(), .textUpdated(listening(late4, on3, late2, late1, early)), effect: nil) }

    @Test func holdAddsToTheHolds() { assert(holding(heldFirst), .hold(heldSecond), reducedTo: holding(heldFirst, heldSecond)) }
    @Test func holdAddsWithNoEffect() { assert(holding(heldFirst), .hold(heldSecond), effect: nil) }

    @Test func holdingAgainChangesNothing() { assert(holding(heldFirst, heldSecond), .hold(heldFirst), reducedTo: holding(heldFirst, heldSecond)) }
    @Test func holdingAgainHasNoEffect() { assert(holding(heldFirst, heldSecond), .hold(heldFirst), effect: nil) }

    @Test func holdsSurviveRevisedText() { assert(holding(heldFirst, heldSecond), .textUpdated(listening(different)), reducedTo: revisedHeld) }
    @Test func revisedHeldTextHasNoEffect() { assert(holding(heldFirst, heldSecond), .textUpdated(listening(different)), effect: nil) }

    @Test func holdsSurviveTheirEntryLeaving() { assert(holding(heldFirst, heldSecond), .textUpdated(listening()), reducedTo: heldOnly()) }
    @Test func heldEntryLeavingHasNoEffect() { assert(holding(heldFirst, heldSecond), .textUpdated(listening()), effect: nil) }

    @Test func holdsSurviveScrollingUp() { assert(heldOnly(), .scrolled(atBottom: false), reducedTo: heldOnly(followsLive: false)) }
    @Test func holdsScrollingUpHasNoEffect() { assert(heldOnly(), .scrolled(atBottom: false), effect: nil) }

    @Test func holdsSurviveJumpToLive() { assert(heldOnly(followsLive: false), .jumpToLive, reducedTo: heldOnly()) }
    @Test func holdsJumpToLiveHasNoEffect() { assert(heldOnly(followsLive: false), .jumpToLive, effect: nil) }

    @Test func holdsSurviveRecordingOff() { assert(heldOnly(), .recordingChanged(.off), reducedTo: heldOnly()) }
    @Test func holdsRecordingOffHasNoEffect() { assert(heldOnly(), .recordingChanged(.off), effect: nil) }

    @Test func holdsSurviveLiveTextOff() { assert(heldOnly(), .textUpdated(.init(status: .off, entries: [])), reducedTo: heldOnly(.off)) }
    @Test func holdsLiveTextOffHasNoEffect() { assert(heldOnly(), .textUpdated(.init(status: .off, entries: [])), effect: nil) }

    @Test func holdsSurviveRecordingOn() { assert(heldOnly(.off), .recordingChanged(.on(elapsed: 12)), reducedTo: heldOnly(.off, recording: .on(elapsed: "00:00:12"))) }
    @Test func holdsRecordingOnHasNoEffect() { assert(heldOnly(.off), .recordingChanged(.on(elapsed: 12)), effect: nil) }

    @Test func holdsSurviveRecordingOffWithLiveTextOff() { assert(heldOnly(.off, recording: .on(elapsed: "00:00:12")), .recordingChanged(.off), reducedTo: heldOnly(.off)) }
    @Test func holdsRecordingOffWithLiveTextOffHasNoEffect() { assert(heldOnly(.off, recording: .on(elapsed: "00:00:12")), .recordingChanged(.off), effect: nil) }

    @Test func holdsSurviveGettingReady() { assert(heldOnly(.off), .textUpdated(.init(status: .gettingReady, entries: [])), reducedTo: heldOnly(.gettingReady)) }
    @Test func holdsGettingReadyHasNoEffect() { assert(heldOnly(.off), .textUpdated(.init(status: .gettingReady, entries: [])), effect: nil) }

    @Test func holdsSurviveFailure() { assert(heldOnly(.gettingReady), .textUpdated(.init(status: .failed("unavailable"), entries: [])), reducedTo: heldOnly(.failed("unavailable"))) }
    @Test func holdsFailureHasNoEffect() { assert(heldOnly(.gettingReady), .textUpdated(.init(status: .failed("unavailable"), entries: [])), effect: nil) }

    @Test func holdsSurviveFinishing() { assert(heldOnly(.failed("unavailable")), .textUpdated(.init(status: .finished, entries: [])), reducedTo: heldOnly(.finished)) }
    @Test func holdsFinishingHasNoEffect() { assert(heldOnly(.failed("unavailable")), .textUpdated(.init(status: .finished, entries: [])), effect: nil) }

    @Test func letGoRemovesOnlyThatHold() { assert(heldOnly(.finished), .letGo(heldFirst), reducedTo: heldOnly(.finished, holds: [heldSecond])) }
    @Test func letGoOfOneHasNoEffect() { assert(heldOnly(.finished), .letGo(heldFirst), effect: nil) }

    @Test func letGoOfAnAbsentHoldChangesNothing() { assert(heldOnly(.finished, holds: [heldSecond]), .letGo(heldFirst), reducedTo: heldOnly(.finished, holds: [heldSecond])) }
    @Test func letGoOfAnAbsentHoldHasNoEffect() { assert(heldOnly(.finished, holds: [heldSecond]), .letGo(heldFirst), effect: nil) }

    @Test func letGoOfTheLastHoldEmptiesHolds() { assert(heldOnly(.finished, holds: [heldSecond]), .letGo(heldSecond), reducedTo: heldOnly(.finished, holds: [])) }
    @Test func letGoOfTheLastHoldHasNoEffect() { assert(heldOnly(.finished, holds: [heldSecond]), .letGo(heldSecond), effect: nil) }

    @Test func settlingIsNotNewBelow() { assert(awayDraft, .textUpdated(listening(settledDraft)), reducedTo: awaySettled) }
    @Test func settlingAwayHasNoEffect() { assert(awayDraft, .textUpdated(listening(settledDraft)), effect: nil) }

    @Test func newIdentitiesCountBelow() { assert(awaySettled, .textUpdated(listening(next, lateTheirs, settledDraft)), reducedTo: arrivals()) }
    @Test func newIdentitiesHaveNoEffect() { assert(awaySettled, .textUpdated(listening(next, lateTheirs, settledDraft)), effect: nil) }

    @Test func reorderedEntriesAreNotNew() { assert(arrivals(), .textUpdated(listening(settledDraft, lateTheirs, next)), reducedTo: arrivals()) }
    @Test func reorderedEntriesHaveNoEffect() { assert(arrivals(), .textUpdated(listening(settledDraft, lateTheirs, next)), effect: nil) }

    @Test func liveTextOffKeepsNewBelow() { assert(arrivals(), .textUpdated(.init(status: .off, entries: [])), reducedTo: arrivals(.off)) }
    @Test func liveTextOffBehindHasNoEffect() { assert(arrivals(), .textUpdated(.init(status: .off, entries: [])), effect: nil) }

    @Test func scrollingToBottomWithLiveTextOffFollows() { assert(arrivals(.off), .scrolled(atBottom: true), reducedTo: arrivals(.off, newBelow: 0, followsLive: true)) }
    @Test func scrollingToBottomWithLiveTextOffHasNoEffect() { assert(arrivals(.off), .scrolled(atBottom: true), effect: nil) }

    @Test func gettingReadyKeepsTheRecording() { assert(recording(.on(elapsed: "00:00:12")), .textUpdated(.init(status: .gettingReady, entries: [])), reducedTo: given(next: 0, status: .gettingReady, recording: twelve)) }
    @Test func gettingReadyHasNoEffect() { assert(recording(.on(elapsed: "00:00:12")), .textUpdated(.init(status: .gettingReady, entries: [])), effect: nil) }

    @Test func listeningWithNothingShowsEmptyLines() { assert(given(next: 0, status: .gettingReady, recording: twelve), .textUpdated(listening()), reducedTo: given(next: 0, recording: twelve)) }
    @Test func listeningWithNothingHasNoEffect() { assert(given(next: 0, status: .gettingReady, recording: twelve), .textUpdated(listening()), effect: nil) }

    @Test func liveTextOffKeepsWhatWasRead() { assert(readSoFar(), .textUpdated(.init(status: .off, entries: [])), reducedTo: readSoFar(.off)) }
    @Test func liveTextOffReadHasNoEffect() { assert(readSoFar(), .textUpdated(.init(status: .off, entries: [])), effect: nil) }

    @Test func gettingReadyKeepsWhatWasRead() { assert(readSoFar(.off), .textUpdated(.init(status: .gettingReady, entries: [])), reducedTo: readSoFar(.gettingReady)) }
    @Test func gettingReadyReadHasNoEffect() { assert(readSoFar(.off), .textUpdated(.init(status: .gettingReady, entries: [])), effect: nil) }

    @Test func failedRestartKeepsWhatWasRead() { assert(readSoFar(.gettingReady), .textUpdated(.init(status: .failed("could not restart"), entries: [])), reducedTo: readSoFar(.failed("could not restart"))) }
    @Test func failedRestartHasNoEffect() { assert(readSoFar(.gettingReady), .textUpdated(.init(status: .failed("could not restart"), entries: [])), effect: nil) }

    @Test func listeningAfterFailureShowsTheSameLines() { assert(readSoFar(.failed("could not restart")), .textUpdated(listening(readEntry)), reducedTo: readSoFar()) }
    @Test func listeningAfterFailureHasNoEffect() { assert(readSoFar(.failed("could not restart")), .textUpdated(listening(readEntry)), effect: nil) }

    @Test func failureKeepsLinesAndRecording() { assert(readSoFar(), .textUpdated(.init(status: .failed("recognition failed"), entries: [])), reducedTo: readSoFar(.failed("recognition failed"))) }
    @Test func failureHasNoEffect() { assert(readSoFar(), .textUpdated(.init(status: .failed("recognition failed"), entries: [])), effect: nil) }

    @Test func finishingKeepsWhatWasRead() { assert(readSoFar(.failed("recognition failed")), .textUpdated(.init(status: .finished, entries: [])), reducedTo: readSoFar(.finished)) }
    @Test func finishingHasNoEffect() { assert(readSoFar(.failed("recognition failed")), .textUpdated(.init(status: .finished, entries: [])), effect: nil) }

    @Test func recordingOffAfterFinishingKeepsLines() { assert(readSoFar(.finished), .recordingChanged(.off), reducedTo: readSoFar(.finished, recording: .off)) }
    @Test func recordingOffAfterFinishingHasNoEffect() { assert(readSoFar(.finished), .recordingChanged(.off), effect: nil) }

    @Test func liveTextOffAfterRecordingKeepsLines() { assert(readSoFar(.finished, recording: .off), .textUpdated(.init(status: .off, entries: [])), reducedTo: readSoFar(.off, recording: .off)) }
    @Test func liveTextOffAfterRecordingHasNoEffect() { assert(readSoFar(.finished, recording: .off), .textUpdated(.init(status: .off, entries: [])), effect: nil) }

    @Test(arguments: transitions) func transitionsReviseAndAddWithoutListening(_ status: ReadingTextUpdate.Status) { assert(beforeRevision, .textUpdated(.init(status: status, entries: [revised, added])), reducedTo: afterRevision(status)) }
    @Test(arguments: transitions) func transitionRevisionsHaveNoEffect(_ status: ReadingTextUpdate.Status) { assert(beforeRevision, .textUpdated(.init(status: status, entries: [revised, added])), effect: nil) }

    @Test func omittedEntryLeavesNoIdentity() { assert(awayAtFour, .textUpdated(listening()), reducedTo: given(next: 1, followsLive: false)) }
    @Test func omittedEntryHasNoEffect() { assert(awayAtFour, .textUpdated(listening()), effect: nil) }

    @Test func returningEntryGetsAFreshIdentity() { assert(given(next: 1, followsLive: false), .textUpdated(listening(atFour)), reducedTo: returnedAtFour) }
    @Test func returningEntryHasNoEffect() { assert(given(next: 1, followsLive: false), .textUpdated(listening(atFour)), effect: nil) }

    @Test func freeingASlotKeepsItsHold() { assert(slotTaken, .textUpdated(listening(still)), reducedTo: slotFreed) }
    @Test func freeingASlotHasNoEffect() { assert(slotTaken, .textUpdated(listening(still)), effect: nil) }

    @Test func reusedSlotGetsAFreshTimeAndID() { assert(slotFreed, .textUpdated(listening(reused, still)), reducedTo: slotReused) }
    @Test func reusedSlotHasNoEffect() { assert(slotFreed, .textUpdated(listening(reused, still)), effect: nil) }

    @Test func reusedSlotSettlesInPlace() { assert(slotReused, .textUpdated(listening(still, reusedSettled)), reducedTo: slotSettled) }
    @Test func reusedSlotSettlingHasNoEffect() { assert(slotReused, .textUpdated(listening(still, reusedSettled)), effect: nil) }
}

struct ReadingLogTests {

    @Test func nothingReadIsEmpty() { #expect(ReadingState().log == .empty) }
    @Test func recordingWithLiveTextOffKeepsNothing() { #expect(recording(.on(elapsed: "00:00:12")).log == .liveTextOff(kept: nil)) }
    @Test func recordingWithLiveTextOffKeepsHolds() { #expect(heldOnly(.off, recording: twelve).log == .liveTextOff(kept: heldOnly().lines)) }
    @Test func liveTextOffWithoutRecordingShowsHolds() { #expect(heldOnly(.off).log == .lines(heldOnly().lines)) }
    @Test func gettingReadyShowsHolds() { #expect(heldOnly(.gettingReady).log == .preparing(holds: [heldFirst, heldSecond])) }
    @Test func gettingReadyShowsNoLines() { #expect(readSoFar(.gettingReady).log == .preparing(holds: [])) }
    @Test func recordingWithLiveTextOffKeepsLines() { #expect(readSoFar(.off).log == .liveTextOff(kept: readSoFar().lines)) }
    @Test func failureShowsLines() { #expect(readSoFar(.failed("could not restart")).log == .lines(readSoFar().lines)) }
    @Test func finishedShowsLines() { #expect(readSoFar(.finished, recording: .off).log == .lines(readSoFar().lines)) }
    @Test func liveTextOffWithoutRecordingShowsLines() { #expect(readSoFar(.off, recording: .off).log == .lines(readSoFar().lines)) }
}

private let entry = ReadingTextUpdate.Entry(id: .init(speaker: .mine, localID: 1), start: 2, end: 3, settled: "words")
private let held = ReadingState.Held(entryID: 0, text: "words")
private let behind = lines { $0.followsLive = false; $0.newBelow = 2 }

private let twelve = ReadingState.Recording.on(elapsed: "00:00:12")

private let draft = text(.mine, 0, start: 8, pending: "draft")
private let first = text(.theirs, 0, start: 2, settled: "first")
// Recognition can revise a segment's timing as well as its words.
private let firm = text(.mine, 0, start: 1, settled: "firm", pending: " next")
private let called = given(
    [anchored(draft, 0), anchored(first, 1)],
    rows: [row(1, "00:02", .theirs, settled: "first"), row(0, "00:08", .mine, pending: "draft")], next: 2
)
private let settledInPlace = given(
    [anchored(firm, 0, at: 8), anchored(first, 1)],
    rows: [row(1, "00:02", .theirs, settled: "first"), row(0, "00:08", .mine, settled: "firm", pending: " next")], next: 2
)

private let late4 = text(.mine, 4, start: 3_607, end: 3_610, late: true)
private let on3 = text(.mine, 3, start: 3_606)
private let late2 = text(.theirs, 2, start: 3_602, end: 3_604, late: true)
private let late1 = text(.mine, 1, start: 3_600.9, end: 3_608, late: true)
private let early = text(.theirs, 0, start: 59.9)
private let lateGroups = given(
    [anchored(late4, 0), anchored(on3, 1), anchored(late2, 2), anchored(late1, 3), anchored(early, 4)],
    rows: [
        row(4, "00:59", .theirs),
        .late(.init(span: "60:00–60:08", entries: [shown(3, "60:00", .mine), shown(2, "60:02", .theirs)])),
        row(1, "60:06", .mine),
        .late(.init(span: "60:07–60:10", entries: [shown(0, "60:07", .mine)])),
    ],
    next: 5
)

private let uncertain = text(.mine, 1, start: 1, pending: "uncertain words")
private let different = text(.mine, 1, start: 1, settled: "different text")
private let heldFirst = ReadingState.Held(entryID: 0, text: "uncertain")
private let heldSecond = ReadingState.Held(entryID: 0, text: "words")
private let revisedHeld = given(
    [anchored(different, 0)], rows: [row(0, "00:01", .mine, settled: "different text")], next: 1,
    holds: [heldFirst, heldSecond]
)

private func holding(_ holds: ReadingState.Held...) -> ReadingState {

    given([anchored(uncertain, 0)], rows: [row(0, "00:01", .mine, pending: "uncertain words")], next: 1, holds: holds)
}

private func heldOnly(
    _ status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = .off,
    holds: [ReadingState.Held] = [heldFirst, heldSecond], followsLive: Bool = true
) -> ReadingState {

    given(next: 1, status: status, recording: recording, holds: holds, followsLive: followsLive)
}

private let pendingDraft = text(.mine, 1, start: 10, pending: "draft")
private let settledDraft = text(.mine, 1, start: 10, settled: "settled")
private let lateTheirs = text(.theirs, 1, start: 2, late: true)
private let next = text(.mine, 2, start: 12)
private let awayDraft = given([anchored(pendingDraft, 0)], rows: [row(0, "00:10", .mine, pending: "draft")], next: 1, followsLive: false)
private let awaySettled = given([anchored(settledDraft, 0)], rows: [row(0, "00:10", .mine, settled: "settled")], next: 1, followsLive: false)

private func arrivals(
    _ status: ReadingTextUpdate.Status = .listening, newBelow: Int = 2, followsLive: Bool = false
) -> ReadingState {

    given(
        [anchored(settledDraft, 0), anchored(next, 1), anchored(lateTheirs, 2)],
        rows: [
            .late(.init(span: "00:02–00:03", entries: [shown(2, "00:02", .theirs)])),
            row(0, "00:10", .mine, settled: "settled"),
            row(1, "00:12", .mine),
        ],
        next: 3, status: status, newBelow: newBelow, followsLive: followsLive
    )
}

private let readEntry = text(.mine, 0, start: 1, settled: "read so far")

private func readSoFar(_ status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = twelve) -> ReadingState {

    given([anchored(readEntry, 0)], rows: [row(0, "00:01", .mine, settled: "read so far")], next: 1, status: status, recording: recording)
}

private let transitions: [ReadingTextUpdate.Status] = [.off, .gettingReady, .failed("interrupted"), .finished]
private let toRevise = text(.mine, 0, start: 1, pending: "draft")
private let keep = text(.theirs, 0, start: 2, settled: "keep this")
private let revised = text(.mine, 0, start: 1, settled: "final words")
private let added = text(.mine, 1, start: 3, settled: "new words")
private let beforeRevision = given(
    [anchored(toRevise, 0), anchored(keep, 1)],
    rows: [row(0, "00:01", .mine, pending: "draft"), row(1, "00:02", .theirs, settled: "keep this")], next: 2
)

private func afterRevision(_ status: ReadingTextUpdate.Status) -> ReadingState {

    given(
        [anchored(revised, 0), anchored(keep, 1), anchored(added, 2)],
        rows: [
            row(0, "00:01", .mine, settled: "final words"),
            row(1, "00:02", .theirs, settled: "keep this"),
            row(2, "00:03", .mine, settled: "new words"),
        ],
        next: 3, status: status
    )
}

private let atFour = text(.mine, 1, start: 4)
private let awayAtFour = given([anchored(atFour, 0)], rows: [row(0, "00:04", .mine)], next: 1, followsLive: false)
private let returnedAtFour = given([anchored(atFour, 1)], rows: [row(1, "00:04", .mine)], next: 2, newBelow: 1, followsLive: false)

private let heldDraft = text(.mine, 0, start: 2, pending: "held draft")
private let still = text(.theirs, 0, start: 5, settled: "still here")
private let reused = text(.mine, 0, start: 12, pending: "new speech")
private let reusedSettled = text(.mine, 0, start: 11, settled: "new speech")
private let slotHeld = ReadingState.Held(entryID: 0, text: "held draft")
private let stillRow = row(1, "00:05", .theirs, settled: "still here")
private let slotTaken = given(
    [anchored(heldDraft, 0), anchored(still, 1)], rows: [row(0, "00:02", .mine, pending: "held draft"), stillRow],
    next: 2, holds: [slotHeld], followsLive: false
)
private let slotFreed = given([anchored(still, 1)], rows: [stillRow], next: 2, holds: [slotHeld], followsLive: false)
private let slotReused = given(
    [anchored(still, 1), anchored(reused, 2)], rows: [stillRow, row(2, "00:12", .mine, pending: "new speech")],
    next: 3, holds: [slotHeld], newBelow: 1, followsLive: false
)
private let slotSettled = given(
    [anchored(still, 1), anchored(reusedSettled, 2, at: 12)], rows: [stillRow, row(2, "00:12", .mine, settled: "new speech")],
    next: 3, holds: [slotHeld], newBelow: 1, followsLive: false
)

private func text(
    _ speaker: ReadingState.Speaker, _ id: Int, start: Double, end: Double? = nil,
    settled: String = "", pending: String = "", late: Bool = false
) -> ReadingTextUpdate.Entry {

    .init(id: .init(speaker: speaker, localID: id), start: start, end: end ?? start + 1,
          settled: settled, pending: pending, writtenLater: late)
}

private struct Anchored {

    let text: ReadingTextUpdate.Entry
    let anchor: ReadingState.Anchor
}

/// An entry's anchor keeps the start it was first seen at.
private func anchored(_ text: ReadingTextUpdate.Entry, _ id: Int, at start: Double? = nil) -> Anchored {

    .init(text: text, anchor: .init(id: id, start: start ?? text.start))
}

private func shown(
    _ id: Int, _ time: String, _ speaker: ReadingState.Speaker, settled: String = "", pending: String = ""
) -> ReadingState.Entry {

    .init(id: id, time: time, speaker: speaker, settled: settled, pending: pending)
}

private func row(
    _ id: Int, _ time: String, _ speaker: ReadingState.Speaker, settled: String = "", pending: String = ""
) -> ReadingState.Row {

    .entry(shown(id, time, speaker, settled: settled, pending: pending))
}

private func given(
    _ shown: [Anchored] = [], rows: [ReadingState.Row] = [], next: Int,
    status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = .off,
    holds: [ReadingState.Held] = [], newBelow: Int = 0, followsLive: Bool = true
) -> ReadingState {

    var state = ReadingState()
    state.status = status
    state.recording = recording
    state.anchors = Dictionary(uniqueKeysWithValues: shown.map { ($0.text.id, $0.anchor) })
    state.text = Dictionary(uniqueKeysWithValues: shown.map { ($0.text.id, $0.text) })
    state.nextDisplayID = next
    state.lines.rows = rows
    state.lines.holds = holds
    state.lines.newBelow = newBelow
    state.lines.followsLive = followsLive
    return state
}

private func listening(_ entries: ReadingTextUpdate.Entry...) -> ReadingTextUpdate { .init(status: .listening, entries: entries) }

private func recording(_ recording: ReadingState.Recording) -> ReadingState {

    var state = ReadingState()
    state.recording = recording
    return state
}

private func lines(_ change: (inout ReadingState.Lines) -> Void) -> ReadingState {

    var state = ReadingState()
    change(&state.lines)
    return state
}

private func read(_ entry: ReadingTextUpdate.Entry) -> ReadingState {

    var state = ReadingState()
    state.status = .listening
    state.anchors = [entry.id: .init(id: 0, start: entry.start)]
    state.nextDisplayID = 1
    state.text = [entry.id: entry]
    state.lines.rows = [.entry(.init(id: 0, time: "00:02", speaker: .mine, settled: "words", pending: ""))]
    return state
}

func assert(
    _ state: ReadingState, _ event: ReadingEvent, reducedTo expected: ReadingState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(ReadingReducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

func assert(
    _ state: ReadingState, _ event: ReadingEvent, effect expected: Never?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(ReadingReducer.reduce(state, event).1 == expected, sourceLocation: sourceLocation)
}
