import Reading
import Testing

struct ReadingReducerTests {

    @Test func recordingOnShowsElapsedTime() {

        assert(makeState(), .recordingChanged(.on(elapsed: 3_661.9)), delivers: nil) {
            $0.recording = .on(elapsed: "01:01:01")
            $0.log = .liveTextOff(kept: nil)
        }
    }

    @Test func recordingOffClearsElapsedTime() {

        assert(makeRecording(.on(elapsed: "00:00:12")), .recordingChanged(.off), delivers: nil) {
            $0.recording = .off
            $0.log = .empty
        }
    }

    @Test func listeningTextBecomesARow() {

        assert(makeState(), .textUpdated(listening(entry)), delivers: nil) {
            $0.status = .listening
            $0.anchors[entry.id] = .init(id: 0, start: 2)
            $0.text[entry.id] = entry
            $0.nextDisplayID = 1
            $0.lines.rows = [row(0, "00:02", .mine, settled: "words")]
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdAddsAHold() {

        assert(makeState(), .hold(held), delivers: nil) {
            $0.lines.holds = [held]
            $0.log = .lines($0.lines)
        }
    }

    @Test func letGoRemovesTheHold() {

        assert(makeLines { $0.holds = [held] }, .letGo(held), delivers: nil) {
            $0.lines.holds = []
            $0.log = .empty
        }
    }

    @Test func scrollingUpStopsFollowing() {

        assert(makeState(), .scrolled(atBottom: false), delivers: nil) {
            $0.lines.followsLive = false
        }
    }

    @Test func scrollingToBottomFollowsAndClearsNew() {

        assert(makeBehind(), .scrolled(atBottom: true), delivers: nil) {
            $0.lines.followsLive = true
            $0.lines.newBelow = 0
        }
    }

    @Test func jumpToLiveFollowsAndClearsNew() {

        assert(makeBehind(), .jumpToLive, delivers: nil) {
            $0.lines.followsLive = true
            $0.lines.newBelow = 0
        }
    }

    @Test func callOrderGivesEachSpeakerItsOwnRow() {

        assert(makeState(), .textUpdated(listening(draft, first)), delivers: nil) {
            $0.status = .listening
            $0.anchors[draft.id] = .init(id: 0, start: 8)
            $0.anchors[first.id] = .init(id: 1, start: 2)
            $0.text[draft.id] = draft
            $0.text[first.id] = first
            $0.nextDisplayID = 2
            $0.lines.rows = [row(1, "00:02", .theirs, settled: "first"), row(0, "00:08", .mine, pending: "draft")]
            $0.log = .lines($0.lines)
        }
    }

    @Test func settlingKeepsIDsTimesAndOrder() {

        assert(makeCalled(), .textUpdated(listening(firm, first)), delivers: nil) {
            $0.text[firm.id] = firm
            $0.lines.rows[1] = row(0, "00:08", .mine, settled: "firm", pending: " next")
            $0.log = .lines($0.lines)
        }
    }

    @Test func recordingRestartShowsZero() {

        assert(makeRecording(.on(elapsed: "01:01:01")), .recordingChanged(.on(elapsed: 0)), delivers: nil) {
            $0.recording = .on(elapsed: "00:00:00")
        }
    }

    @Test func consecutiveLateEntriesGroupInCallOrder() {

        assert(makeState(), .textUpdated(listening(late4, on3, late2, late1, early)), delivers: nil) {
            $0.status = .listening
            for (id, text) in [late4, on3, late2, late1, early].enumerated() {
                $0.anchors[text.id] = .init(id: id, start: text.start)
                $0.text[text.id] = text
            }
            $0.nextDisplayID = 5
            $0.lines.rows = [
                row(4, "00:59", .theirs),
                .late(.init(span: "60:00–60:08", entries: [shown(3, "60:00", .mine), shown(2, "60:02", .theirs)])),
                row(1, "60:06", .mine),
                .late(.init(span: "60:07–60:10", entries: [shown(0, "60:07", .mine)])),
            ]
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdAddsToTheHolds() {

        assert(makeHolding(heldFirst), .hold(heldSecond), delivers: nil) {
            $0.lines.holds.append(heldSecond)
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdingAgainChangesNothing() {

        assert(makeHolding(heldFirst, heldSecond), .hold(heldFirst), delivers: nil)
    }

    @Test func holdsSurviveRevisedText() {

        assert(makeHolding(heldFirst, heldSecond), .textUpdated(listening(different)), delivers: nil) {
            $0.text[different.id] = different
            $0.lines.rows[0] = row(0, "00:01", .mine, settled: "different text")
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdsSurviveTheirEntryLeaving() {

        assert(makeHolding(heldFirst, heldSecond), .textUpdated(listening()), delivers: nil) {
            $0.text[uncertain.id] = nil
            $0.anchors[uncertain.id] = nil
            $0.lines.rows = []
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdsSurviveScrollingUp() {

        assert(makeHeldOnly(), .scrolled(atBottom: false), delivers: nil) {
            $0.lines.followsLive = false
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdsSurviveJumpToLive() {

        assert(makeHeldOnly(followsLive: false), .jumpToLive, delivers: nil) {
            $0.lines.followsLive = true
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdsSurviveRecordingOff() {

        assert(makeHeldOnly(), .recordingChanged(.off), delivers: nil)
    }

    @Test func holdsSurviveLiveTextOff() {

        assert(makeHeldOnly(), .textUpdated(.init(status: .off, entries: [])), delivers: nil) {
            $0.status = .off
        }
    }

    @Test func holdsSurviveRecordingOn() {

        assert(makeHeldOnly(.off), .recordingChanged(.on(elapsed: 12)), delivers: nil) {
            $0.recording = .on(elapsed: "00:00:12")
            $0.log = .liveTextOff(kept: $0.lines)
        }
    }

    @Test func holdsSurviveRecordingOffWithLiveTextOff() {

        assert(makeHeldOnly(.off, recording: .on(elapsed: "00:00:12")), .recordingChanged(.off), delivers: nil) {
            $0.recording = .off
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdsSurviveGettingReady() {

        assert(makeHeldOnly(.off), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil) {
            $0.status = .gettingReady
            $0.log = .preparing(holds: $0.lines.holds)
        }
    }

    @Test func holdsSurviveFailure() {

        assert(makeHeldOnly(.gettingReady), .textUpdated(.init(status: .failed("unavailable"), entries: [])), delivers: nil) {
            $0.status = .failed("unavailable")
            $0.log = .lines($0.lines)
        }
    }

    @Test func holdsSurviveFinishing() {

        assert(makeHeldOnly(.failed("unavailable")), .textUpdated(.init(status: .finished, entries: [])), delivers: nil) {
            $0.status = .finished
        }
    }

    @Test func letGoRemovesOnlyThatHold() {

        assert(makeHeldOnly(.finished), .letGo(heldFirst), delivers: nil) {
            $0.lines.holds.removeFirst()
            $0.log = .lines($0.lines)
        }
    }

    @Test func letGoOfAnAbsentHoldChangesNothing() {

        assert(makeHeldOnly(.finished, holds: [heldSecond]), .letGo(heldFirst), delivers: nil)
    }

    @Test func letGoOfTheLastHoldEmptiesHolds() {

        assert(makeHeldOnly(.finished, holds: [heldSecond]), .letGo(heldSecond), delivers: nil) {
            $0.lines.holds = []
            $0.log = .lines($0.lines)
        }
    }

    @Test func settlingIsNotNewBelow() {

        assert(makeAwayDraft(), .textUpdated(listening(settledDraft)), delivers: nil) {
            $0.text[settledDraft.id] = settledDraft
            $0.lines.rows[0] = row(0, "00:10", .mine, settled: "settled")
            $0.log = .lines($0.lines)
        }
    }

    @Test func newIdentitiesCountBelow() {

        assert(makeAwaySettled(), .textUpdated(listening(next, lateTheirs, settledDraft)), delivers: nil) {
            $0.text[next.id] = next
            $0.text[lateTheirs.id] = lateTheirs
            $0.anchors[next.id] = .init(id: 1, start: 12)
            $0.anchors[lateTheirs.id] = .init(id: 2, start: 2)
            $0.nextDisplayID = 3
            $0.lines.newBelow = 2
            $0.lines.rows.insert(.late(.init(span: "00:02–00:03", entries: [shown(2, "00:02", .theirs)])), at: 0)
            $0.lines.rows.append(row(1, "00:12", .mine))
            $0.log = .lines($0.lines)
        }
    }

    @Test func reorderedEntriesAreNotNew() {

        assert(makeArrivals(), .textUpdated(listening(settledDraft, lateTheirs, next)), delivers: nil)
    }

    @Test func liveTextOffKeepsNewBelow() {

        assert(makeArrivals(), .textUpdated(.init(status: .off, entries: [])), delivers: nil) {
            $0.status = .off
        }
    }

    @Test func scrollingToBottomWithLiveTextOffFollows() {

        assert(makeArrivals(.off), .scrolled(atBottom: true), delivers: nil) {
            $0.lines.newBelow = 0
            $0.lines.followsLive = true
            $0.log = .lines($0.lines)
        }
    }

    @Test func gettingReadyKeepsTheRecording() {

        assert(makeRecording(.on(elapsed: "00:00:12")), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil) {
            $0.status = .gettingReady
            $0.log = .preparing(holds: [])
        }
    }

    @Test func listeningWithNothingShowsEmptyLines() {

        assert(makeGiven(next: 0, status: .gettingReady, recording: twelve), .textUpdated(listening()), delivers: nil) {
            $0.status = .listening
            $0.log = .lines($0.lines)
        }
    }

    @Test func liveTextOffKeepsWhatWasRead() {

        assert(makeReadSoFar(), .textUpdated(.init(status: .off, entries: [])), delivers: nil) {
            $0.status = .off
            $0.log = .liveTextOff(kept: $0.lines)
        }
    }

    @Test func gettingReadyKeepsWhatWasRead() {

        assert(makeReadSoFar(.off), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil) {
            $0.status = .gettingReady
            $0.log = .preparing(holds: [])
        }
    }

    @Test func failedRestartKeepsWhatWasRead() {

        assert(makeReadSoFar(.gettingReady), .textUpdated(.init(status: .failed("could not restart"), entries: [])), delivers: nil) {
            $0.status = .failed("could not restart")
            $0.log = .lines($0.lines)
        }
    }

    @Test func listeningAfterFailureShowsTheSameLines() {

        assert(makeReadSoFar(.failed("could not restart")), .textUpdated(listening(readEntry)), delivers: nil) {
            $0.status = .listening
        }
    }

    @Test func failureKeepsLinesAndRecording() {

        assert(makeReadSoFar(), .textUpdated(.init(status: .failed("recognition failed"), entries: [])), delivers: nil) {
            $0.status = .failed("recognition failed")
        }
    }

    @Test func finishingKeepsWhatWasRead() {

        assert(makeReadSoFar(.failed("recognition failed")), .textUpdated(.init(status: .finished, entries: [])), delivers: nil) {
            $0.status = .finished
        }
    }

    @Test func recordingOffAfterFinishingKeepsLines() {

        assert(makeReadSoFar(.finished), .recordingChanged(.off), delivers: nil) {
            $0.recording = .off
        }
    }

    @Test func liveTextOffAfterRecordingKeepsLines() {

        assert(makeReadSoFar(.finished, recording: .off), .textUpdated(.init(status: .off, entries: [])), delivers: nil) {
            $0.status = .off
        }
    }

    @Test(arguments: transitions) func transitionsReviseAndAddWithoutListening(_ status: ReadingTextUpdate.Status) {

        assert(makeBeforeRevision(), .textUpdated(.init(status: status, entries: [revised, added])), delivers: nil) {
            $0.status = status
            $0.text[revised.id] = revised
            $0.text[added.id] = added
            $0.anchors[added.id] = .init(id: 2, start: 3)
            $0.nextDisplayID = 3
            $0.lines.rows[0] = row(0, "00:01", .mine, settled: "final words")
            $0.lines.rows.append(row(2, "00:03", .mine, settled: "new words"))
            $0.log = status == .gettingReady ? .preparing(holds: []) : .lines($0.lines)
        }
    }

    @Test func omittedEntryLeavesNoIdentity() {

        assert(makeAwayAtFour(), .textUpdated(listening()), delivers: nil) {
            $0.text[atFour.id] = nil
            $0.anchors[atFour.id] = nil
            $0.lines.rows = []
            $0.log = .lines($0.lines)
        }
    }

    @Test func returningEntryGetsAFreshIdentity() {

        assert(makeGiven(next: 1, followsLive: false), .textUpdated(listening(atFour)), delivers: nil) {
            $0.text[atFour.id] = atFour
            $0.anchors[atFour.id] = .init(id: 1, start: 4)
            $0.nextDisplayID = 2
            $0.lines.rows = [row(1, "00:04", .mine)]
            $0.lines.newBelow = 1
            $0.log = .lines($0.lines)
        }
    }

    @Test func freeingASlotKeepsItsHold() {

        assert(makeSlotTaken(), .textUpdated(listening(still)), delivers: nil) {
            $0.text[heldDraft.id] = nil
            $0.anchors[heldDraft.id] = nil
            $0.lines.rows.removeFirst()
            $0.log = .lines($0.lines)
        }
    }

    @Test func reusedSlotGetsAFreshTimeAndID() {

        assert(makeSlotFreed(), .textUpdated(listening(reused, still)), delivers: nil) {
            $0.text[reused.id] = reused
            $0.anchors[reused.id] = .init(id: 2, start: 12)
            $0.nextDisplayID = 3
            $0.lines.newBelow = 1
            $0.lines.rows.append(row(2, "00:12", .mine, pending: "new speech"))
            $0.log = .lines($0.lines)
        }
    }

    @Test func reusedSlotSettlesInPlace() {

        assert(makeSlotReused(), .textUpdated(listening(still, reusedSettled)), delivers: nil) {
            $0.text[reusedSettled.id] = reusedSettled
            $0.lines.rows[1] = row(2, "00:12", .mine, settled: "new speech")
            $0.log = .lines($0.lines)
        }
    }
}

struct ReadingLogTests {

    @Test func nothingReadIsEmpty() {

        assert(makeState(), .jumpToLive, delivers: nil)
    }

    @Test func recordingWithLiveTextOffKeepsNothing() {

        assert(makeLogState(recording: twelve), .jumpToLive, delivers: nil) {
            $0.log = .liveTextOff(kept: nil)
        }
    }

    @Test func recordingWithLiveTextOffKeepsHolds() {

        assert(makeLogState(holds: [heldFirst, heldSecond], recording: twelve), .jumpToLive, delivers: nil) {
            $0.log = .liveTextOff(kept: $0.lines)
        }
    }

    @Test func liveTextOffWithoutRecordingShowsHolds() {

        assert(makeLogState(holds: [heldFirst, heldSecond]), .jumpToLive, delivers: nil) {
            $0.log = .lines($0.lines)
        }
    }

    @Test func gettingReadyShowsHolds() {

        assert(makeLogState(.gettingReady, holds: [heldFirst, heldSecond]), .jumpToLive, delivers: nil) {
            $0.log = .preparing(holds: $0.lines.holds)
        }
    }

    @Test func gettingReadyShowsNoLines() {

        assert(makeLogState(.gettingReady, rows: [row(0, "00:01", .mine, settled: "read so far")]), .jumpToLive, delivers: nil) {
            $0.log = .preparing(holds: [])
        }
    }

    @Test func recordingWithLiveTextOffKeepsLines() {

        assert(makeLogState(rows: [row(0, "00:01", .mine, settled: "read so far")], recording: twelve), .jumpToLive, delivers: nil) {
            $0.log = .liveTextOff(kept: $0.lines)
        }
    }

    @Test(arguments: [ReadingTextUpdate.Status.listening, .failed("could not restart"), .finished, .off])
    func availableLinesStayVisible(_ status: ReadingTextUpdate.Status) {

        assert(makeLogState(status, rows: [row(0, "00:01", .mine, settled: "read so far")]), .jumpToLive, delivers: nil) {
            $0.log = .lines($0.lines)
        }
    }
}

private func makeLogState(
    _ status: ReadingTextUpdate.Status = .off, rows: [ReadingState.Row] = [],
    holds: [ReadingState.Held] = [], recording: ReadingState.Recording = .off
) -> ReadingState {

    .init(recording: recording, status: status, lines: .init(rows: .init(tail: rows), holds: holds))
}

private let entry = ReadingTextUpdate.Entry(id: .init(speaker: .mine, localID: 1), start: 2, end: 3, settled: "words")
private let held = ReadingState.Held(entryID: 0, text: "words")
private func makeBehind() -> ReadingState {

    makeLines {
        $0.followsLive = false
        $0.newBelow = 2
    }
}

private let twelve = ReadingState.Recording.on(elapsed: "00:00:12")

private let draft = text(.mine, 0, start: 8, pending: "draft")
private let first = text(.theirs, 0, start: 2, settled: "first")
// Recognition can revise a segment's timing as well as its words.
private let firm = text(.mine, 0, start: 1, settled: "firm", pending: " next")
private func makeCalled() -> ReadingState {

    makeGiven(
        [anchored(draft, 0), anchored(first, 1)],
        rows: [row(1, "00:02", .theirs, settled: "first"), row(0, "00:08", .mine, pending: "draft")], next: 2
    )
}

private let late4 = text(.mine, 4, start: 3_607, end: 3_610, late: true)
private let on3 = text(.mine, 3, start: 3_606)
private let late2 = text(.theirs, 2, start: 3_602, end: 3_604, late: true)
private let late1 = text(.mine, 1, start: 3_600.9, end: 3_608, late: true)
private let early = text(.theirs, 0, start: 59.9)

private let uncertain = text(.mine, 1, start: 1, pending: "uncertain words")
private let different = text(.mine, 1, start: 1, settled: "different text")
private let heldFirst = ReadingState.Held(entryID: 0, text: "uncertain")
private let heldSecond = ReadingState.Held(entryID: 0, text: "words")

private func makeHolding(_ holds: ReadingState.Held...) -> ReadingState {

    makeGiven([anchored(uncertain, 0)], rows: [row(0, "00:01", .mine, pending: "uncertain words")], next: 1, holds: holds)
}

private func makeHeldOnly(
    _ status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = .off,
    holds: [ReadingState.Held] = [heldFirst, heldSecond], followsLive: Bool = true
) -> ReadingState {

    makeGiven(next: 1, status: status, recording: recording, holds: holds, followsLive: followsLive)
}

private let pendingDraft = text(.mine, 1, start: 10, pending: "draft")
private let settledDraft = text(.mine, 1, start: 10, settled: "settled")
private let lateTheirs = text(.theirs, 1, start: 2, late: true)
private let next = text(.mine, 2, start: 12)
private func makeAwayDraft() -> ReadingState {

    makeGiven([anchored(pendingDraft, 0)], rows: [row(0, "00:10", .mine, pending: "draft")], next: 1, followsLive: false)
}
private func makeAwaySettled() -> ReadingState {

    makeGiven([anchored(settledDraft, 0)], rows: [row(0, "00:10", .mine, settled: "settled")], next: 1, followsLive: false)
}

private func makeArrivals(
    _ status: ReadingTextUpdate.Status = .listening, newBelow: Int = 2, followsLive: Bool = false
) -> ReadingState {

    makeGiven(
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

private func makeReadSoFar(_ status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = twelve) -> ReadingState {

    makeGiven([anchored(readEntry, 0)], rows: [row(0, "00:01", .mine, settled: "read so far")], next: 1, status: status, recording: recording)
}

private let transitions: [ReadingTextUpdate.Status] = [.off, .gettingReady, .failed("interrupted"), .finished]
private let toRevise = text(.mine, 0, start: 1, pending: "draft")
private let keep = text(.theirs, 0, start: 2, settled: "keep this")
private let revised = text(.mine, 0, start: 1, settled: "final words")
private let added = text(.mine, 1, start: 3, settled: "new words")
private func makeBeforeRevision() -> ReadingState {

    makeGiven(
        [anchored(toRevise, 0), anchored(keep, 1)],
        rows: [row(0, "00:01", .mine, pending: "draft"), row(1, "00:02", .theirs, settled: "keep this")], next: 2
    )
}

private let atFour = text(.mine, 1, start: 4)
private func makeAwayAtFour() -> ReadingState {

    makeGiven([anchored(atFour, 0)], rows: [row(0, "00:04", .mine)], next: 1, followsLive: false)
}

private let heldDraft = text(.mine, 0, start: 2, pending: "held draft")
private let still = text(.theirs, 0, start: 5, settled: "still here")
private let reused = text(.mine, 0, start: 12, pending: "new speech")
private let reusedSettled = text(.mine, 0, start: 11, settled: "new speech")
private let slotHeld = ReadingState.Held(entryID: 0, text: "held draft")
private let stillRow = row(1, "00:05", .theirs, settled: "still here")
private func makeSlotTaken() -> ReadingState {

    makeGiven(
        [anchored(heldDraft, 0), anchored(still, 1)], rows: [row(0, "00:02", .mine, pending: "held draft"), stillRow],
        next: 2, holds: [slotHeld], followsLive: false
    )
}
private func makeSlotFreed() -> ReadingState {

    makeGiven([anchored(still, 1)], rows: [stillRow], next: 2, holds: [slotHeld], followsLive: false)
}
private func makeSlotReused() -> ReadingState {

    makeGiven(
        [anchored(still, 1), anchored(reused, 2)], rows: [stillRow, row(2, "00:12", .mine, pending: "new speech")],
        next: 3, holds: [slotHeld], newBelow: 1, followsLive: false
    )
}

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

private func makeGiven(
    _ shown: [Anchored] = [], rows: [ReadingState.Row] = [], next: Int,
    status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = .off,
    holds: [ReadingState.Held] = [], newBelow: Int = 0, followsLive: Bool = true
) -> ReadingState {

    var state = ReadingState()
    state.status = status
    state.recording = recording
    state.anchors = .init(uniqueKeysWithValues: shown.map { ($0.text.id, $0.anchor) })
    state.text = .init(uniqueKeysWithValues: shown.map { ($0.text.id, $0.text) })
    state.nextDisplayID = next
    state.lines.rows = .init(tail: rows)
    state.lines.holds = holds
    state.lines.newBelow = newBelow
    state.lines.followsLive = followsLive
    state.log = makeLog(state)
    return state
}

private func listening(_ entries: ReadingTextUpdate.Entry...) -> ReadingTextUpdate { .init(status: .listening, entries: entries) }

private func makeRecording(_ recording: ReadingState.Recording) -> ReadingState {

    var state = ReadingState()
    state.recording = recording
    state.log = makeLog(state)
    return state
}

private func makeLines(_ change: (inout ReadingState.Lines) -> Void) -> ReadingState {

    var state = ReadingState()
    change(&state.lines)
    state.log = makeLog(state)
    return state
}

func assert(
    _ state: ReadingState, _ event: ReadingEvent, delivers effect: Never?,
    using reducer: ReadingReducer? = nil,
    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout ReadingState) -> Void = { _ in }
) {
    var expected = state
    change(&expected)
    let result = reducer?.reduce(state, event) ?? ReadingReducer.reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}

private func makeState() -> ReadingState { .init() }

private func makeLog(_ state: ReadingState) -> ReadingState.Log {

    switch state.status {
    case .off:
        let kept = state.lines.rows.isEmpty && state.lines.holds.isEmpty ? nil : state.lines
        return state.recording == .off ? kept.map(ReadingState.Log.lines) ?? .empty : .liveTextOff(kept: kept)
    case .gettingReady: return .preparing(holds: state.lines.holds)
    case .listening, .failed, .finished: return .lines(state.lines)
    }
}
