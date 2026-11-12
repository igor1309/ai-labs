import Reading
import Testing

struct ReadingReducerTests {

    @Test func recordingOnShowsElapsedTime() {

        let spy = RenderingSpy()
        assert(makeState(), .recordingChanged(.on(elapsed: 3_661.9)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(3661.9)")
            $0.log = .liveTextOff(kept: nil)
        }
        #expect(spy.calls == [.recording(3661.9)])
    }

    @Test func recordingOffClearsElapsedTime() {

        let spy = RenderingSpy()
        assert(makeRecording(.on(elapsed: "recording(12.0)")), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.recording = .off
            $0.log = .empty
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func listeningTextBecomesARow() {

        let spy = RenderingSpy()
        assert(makeState(), .textUpdated(listening(entry)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .listening
            $0.anchors[entry.id] = .init(id: 0, start: 2)
            $0.text[entry.id] = entry
            $0.nextDisplayID = 1
            $0.lines.rows = [row(0, "line(2.0)", .mine, settled: "words")]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((entry.id, shown(0, "line(2.0)", .mine, settled: "words"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(2.0)])
    }

    @Test func holdAddsAHold() {

        let spy = RenderingSpy()
        assert(makeState(), .hold(held), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = [held]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func letGoRemovesTheHold() {

        let spy = RenderingSpy()
        assert(makeLines { $0.holds = [held] }, .letGo(held), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = []
            $0.log = .empty
        }
        #expect(spy.calls == [])
    }

    @Test func scrollingUpStopsFollowing() {

        let spy = RenderingSpy()
        assert(makeState(), .scrolled(atBottom: false), delivers: nil, using: makeReducer(spy)) {
            $0.lines.followsLive = false
        }
        #expect(spy.calls == [])
    }

    @Test func scrollingToBottomFollowsAndClearsNew() {

        let spy = RenderingSpy()
        assert(makeBehind(), .scrolled(atBottom: true), delivers: nil, using: makeReducer(spy)) {
            $0.lines.followsLive = true
            $0.lines.newBelow = 0
        }
        #expect(spy.calls == [])
    }

    @Test func jumpToLiveFollowsAndClearsNew() {

        let spy = RenderingSpy()
        assert(makeBehind(), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.lines.followsLive = true
            $0.lines.newBelow = 0
        }
        #expect(spy.calls == [])
    }

    @Test func callOrderGivesEachSpeakerItsOwnRow() {

        let spy = RenderingSpy()
        assert(makeState(), .textUpdated(listening(draft, first)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .listening
            $0.anchors[draft.id] = .init(id: 0, start: 8)
            $0.anchors[first.id] = .init(id: 1, start: 2)
            $0.text[draft.id] = draft
            $0.text[first.id] = first
            $0.nextDisplayID = 2
            $0.lines.rows = [row(1, "line(2.0)", .theirs, settled: "first"), row(0, "line(8.0)", .mine, pending: "draft")]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((first.id, shown(1, "line(2.0)", .theirs, settled: "first"), .init(row: 0)), (draft.id, shown(0, "line(8.0)", .mine, pending: "draft"), .init(row: 1)))
        }
        #expect(counted(spy.calls) == counted([.line(8.0), .line(2.0)]))
    }

    @Test func settlingKeepsIDsTimesAndOrder() {

        let spy = RenderingSpy()
        assert(makeCalled(), .textUpdated(listening(firm, first)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[firm.id] = firm
            $0.lines.rows[1] = row(0, "line(8.0)", .mine, settled: "firm", pending: " next")
            $0.log = .lines($0.lines)
            $0.rendered = prepared((first.id, shown(1, "line(2.0)", .theirs, settled: "first"), .init(row: 0)), (firm.id, shown(0, "line(8.0)", .mine, settled: "firm", pending: " next"), .init(row: 1)))
        }
        #expect(counted(spy.calls) == counted([.line(2.0), .line(8.0), .line(8.0)]))
    }

    @Test func recordingRestartShowsZero() {

        let spy = RenderingSpy()
        assert(makeRecording(.on(elapsed: "recording(3661.9)")), .recordingChanged(.on(elapsed: 0)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(0.0)")
        }
        #expect(spy.calls == [.recording(0.0)])
    }

    @Test func consecutiveLateEntriesGroupInCallOrder() {

        let spy = RenderingSpy()
        assert(makeState(), .textUpdated(listening(late4, on3, late2, late1, early)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .listening
            for (id, text) in [late4, on3, late2, late1, early].enumerated() {
                $0.anchors[text.id] = .init(id: id, start: text.start)
                $0.text[text.id] = text
            }
            $0.nextDisplayID = 5
            $0.lines.rows = [
                row(4, "line(59.9)", .theirs),
                .late(.init(span: "span[line(3600.9)|line(3608.0)]", entries: [shown(3, "line(3600.9)", .mine), shown(2, "line(3602.0)", .theirs)])),
                row(1, "line(3606.0)", .mine),
                .late(.init(span: "span[line(3607.0)|line(3610.0)]", entries: [shown(0, "line(3607.0)", .mine)])),
            ]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((early.id, shown(4, "line(59.9)", .theirs), .init(row: 0)), (late1.id, shown(3, "line(3600.9)", .mine), .init(row: 1, lateEntry: 0)), (late2.id, shown(2, "line(3602.0)", .theirs), .init(row: 1, lateEntry: 1)), (on3.id, shown(1, "line(3606.0)", .mine), .init(row: 2)), (late4.id, shown(0, "line(3607.0)", .mine), .init(row: 3, lateEntry: 0)))
        }
        #expect(counted(spy.calls) == counted([.line(3607.0), .line(3606.0), .line(3602.0), .line(3600.9), .line(59.9), .line(3600.9), .line(3608.0), .span("line(3600.9)", "line(3608.0)"), .line(3607.0), .line(3610.0), .span("line(3607.0)", "line(3610.0)")]))
    }

    @Test func holdAddsToTheHolds() {

        let spy = RenderingSpy()
        assert(makeHolding(heldFirst), .hold(heldSecond), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds.append(heldSecond)
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func holdingAgainChangesNothing() {

        let spy = RenderingSpy()
        assert(makeHolding(heldFirst, heldSecond), .hold(heldFirst), delivers: nil, using: makeReducer(spy))
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveRevisedText() {

        let spy = RenderingSpy()
        assert(makeHolding(heldFirst, heldSecond), .textUpdated(listening(different)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[different.id] = different
            $0.lines.rows[0] = row(0, "line(1.0)", .mine, settled: "different text")
            $0.log = .lines($0.lines)
            $0.rendered = prepared((different.id, shown(0, "line(1.0)", .mine, settled: "different text"), .init(row: 0)))
        }
        #expect(counted(spy.calls) == counted([.line(1.0), .line(1.0)]))
    }

    @Test func holdsSurviveTheirEntryLeaving() {

        let spy = RenderingSpy()
        assert(makeHolding(heldFirst, heldSecond), .textUpdated(listening()), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[uncertain.id] = nil
            $0.anchors[uncertain.id] = nil
            $0.lines.rows = []
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func holdsSurviveScrollingUp() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(), .scrolled(atBottom: false), delivers: nil, using: makeReducer(spy)) {
            $0.lines.followsLive = false
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveJumpToLive() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(followsLive: false), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.lines.followsLive = true
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveRecordingOff() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveLiveTextOff() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(), .textUpdated(.init(status: .off, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .off
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveRecordingOn() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.off), .recordingChanged(.on(elapsed: 12)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(12.0)")
            $0.log = .liveTextOff(kept: $0.lines)
        }
        #expect(spy.calls == [.recording(12.0)])
    }

    @Test func holdsSurviveRecordingOffWithLiveTextOff() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.off, recording: .on(elapsed: "recording(12.0)")), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.recording = .off
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveGettingReady() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.off), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .gettingReady
            $0.log = .preparing(holds: $0.lines.holds)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveFailure() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.gettingReady), .textUpdated(.init(status: .failed("unavailable"), entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .failed("unavailable")
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func holdsSurviveFinishing() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.failed("unavailable")), .textUpdated(.init(status: .finished, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .finished
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func letGoRemovesOnlyThatHold() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.finished), .letGo(heldFirst), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds.removeFirst()
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func letGoOfAnAbsentHoldChangesNothing() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.finished, holds: [heldSecond]), .letGo(heldFirst), delivers: nil, using: makeReducer(spy))
        #expect(spy.calls == [])
    }

    @Test func letGoOfTheLastHoldEmptiesHolds() {

        let spy = RenderingSpy()
        assert(makeHeldOnly(.finished, holds: [heldSecond]), .letGo(heldSecond), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = []
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func settlingIsNotNewBelow() {

        let spy = RenderingSpy()
        assert(makeAwayDraft(), .textUpdated(listening(settledDraft)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[settledDraft.id] = settledDraft
            $0.lines.rows[0] = row(0, "line(10.0)", .mine, settled: "settled")
            $0.log = .lines($0.lines)
            $0.rendered = prepared((settledDraft.id, shown(0, "line(10.0)", .mine, settled: "settled"), .init(row: 0)))
        }
        #expect(counted(spy.calls) == counted([.line(10.0), .line(10.0)]))
    }

    @Test func newIdentitiesCountBelow() {

        let spy = RenderingSpy()
        assert(makeAwaySettled(), .textUpdated(listening(next, lateTheirs, settledDraft)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[next.id] = next
            $0.text[lateTheirs.id] = lateTheirs
            $0.anchors[next.id] = .init(id: 1, start: 12)
            $0.anchors[lateTheirs.id] = .init(id: 2, start: 2)
            $0.nextDisplayID = 3
            $0.lines.newBelow = 2
            $0.lines.rows.insert(.late(.init(span: "span[line(2.0)|line(3.0)]", entries: [shown(2, "line(2.0)", .theirs)])), at: 0)
            $0.lines.rows.append(row(1, "line(12.0)", .mine))
            $0.log = .lines($0.lines)
            $0.rendered = prepared((lateTheirs.id, shown(2, "line(2.0)", .theirs), .init(row: 0, lateEntry: 0)), (settledDraft.id, shown(0, "line(10.0)", .mine, settled: "settled"), .init(row: 1)), (next.id, shown(1, "line(12.0)", .mine), .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(10.0), .line(12.0), .line(2.0), .line(2.0), .line(3.0), .span("line(2.0)", "line(3.0)")]))
    }

    @Test func reorderedEntriesAreNotNew() {

        let spy = RenderingSpy()
        assert(makeArrivals(), .textUpdated(listening(settledDraft, lateTheirs, next)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.log = .lines($0.lines)
            $0.rendered = prepared((lateTheirs.id, shown(2, "line(2.0)", .theirs), .init(row: 0, lateEntry: 0)), (settledDraft.id, shown(0, "line(10.0)", .mine, settled: "settled"), .init(row: 1)), (next.id, shown(1, "line(12.0)", .mine), .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(2.0), .line(10.0), .line(12.0), .line(2.0), .line(3.0), .span("line(2.0)", "line(3.0)")]))
    }

    @Test func liveTextOffKeepsNewBelow() {

        let spy = RenderingSpy()
        assert(makeArrivals(), .textUpdated(.init(status: .off, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .off
            $0.log = .lines($0.lines)
            $0.rendered = prepared((lateTheirs.id, shown(2, "line(2.0)", .theirs), .init(row: 0, lateEntry: 0)), (settledDraft.id, shown(0, "line(10.0)", .mine, settled: "settled"), .init(row: 1)), (next.id, shown(1, "line(12.0)", .mine), .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(2.0), .line(12.0), .line(10.0), .line(2.0), .line(3.0), .span("line(2.0)", "line(3.0)")]))
    }

    @Test func scrollingToBottomWithLiveTextOffFollows() {

        let spy = RenderingSpy()
        assert(makeArrivals(.off), .scrolled(atBottom: true), delivers: nil, using: makeReducer(spy)) {
            $0.lines.newBelow = 0
            $0.lines.followsLive = true
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func gettingReadyKeepsTheRecording() {

        let spy = RenderingSpy()
        assert(makeRecording(.on(elapsed: "recording(12.0)")), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .gettingReady
            $0.log = .preparing(holds: [])
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func listeningWithNothingShowsEmptyLines() {

        let spy = RenderingSpy()
        assert(makeGiven(next: 0, status: .gettingReady, recording: twelve), .textUpdated(listening()), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .listening
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }

    @Test func liveTextOffKeepsWhatWasRead() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(), .textUpdated(.init(status: .off, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .off
            $0.log = .liveTextOff(kept: $0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func gettingReadyKeepsWhatWasRead() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(.off), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .gettingReady
            $0.log = .preparing(holds: [])
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func failedRestartKeepsWhatWasRead() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(.gettingReady), .textUpdated(.init(status: .failed("could not restart"), entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .failed("could not restart")
            $0.log = .lines($0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func listeningAfterFailureShowsTheSameLines() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(.failed("could not restart")), .textUpdated(listening(readEntry)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .listening
            $0.log = .lines($0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func failureKeepsLinesAndRecording() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(), .textUpdated(.init(status: .failed("recognition failed"), entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .failed("recognition failed")
            $0.log = .lines($0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func finishingKeepsWhatWasRead() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(.failed("recognition failed")), .textUpdated(.init(status: .finished, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .finished
            $0.log = .lines($0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func recordingOffAfterFinishingKeepsLines() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(.finished), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.recording = .off
            $0.log = .lines($0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test func liveTextOffAfterRecordingKeepsLines() {

        let spy = RenderingSpy()
        assert(makeReadSoFar(.finished, recording: .off), .textUpdated(.init(status: .off, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .off
            $0.log = .lines($0.lines)
            $0.rendered = prepared((readEntry.id, shown(0, "line(1.0)", .mine, settled: "read so far"), .init(row: 0)))
        }
        #expect(spy.calls == [.line(1.0)])
    }

    @Test(arguments: transitions) func transitionsReviseAndAddWithoutListening(_ status: ReadingTextUpdate.Status) {

        let spy = RenderingSpy()
        assert(makeBeforeRevision(), .textUpdated(.init(status: status, entries: [revised, added])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = status
            $0.text[revised.id] = revised
            $0.text[added.id] = added
            $0.anchors[added.id] = .init(id: 2, start: 3)
            $0.nextDisplayID = 3
            $0.lines.rows[0] = row(0, "line(1.0)", .mine, settled: "final words")
            $0.lines.rows.append(row(2, "line(3.0)", .mine, settled: "new words"))
            $0.log = status == .gettingReady ? .preparing(holds: []) : .lines($0.lines)
            $0.rendered = prepared((revised.id, shown(0, "line(1.0)", .mine, settled: "final words"), .init(row: 0)), (keep.id, shown(1, "line(2.0)", .theirs, settled: "keep this"), .init(row: 1)), (added.id, shown(2, "line(3.0)", .mine, settled: "new words"), .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(1.0), .line(2.0), .line(1.0), .line(3.0)]))
    }

    @Test func omittedEntryLeavesNoIdentity() {

        let spy = RenderingSpy()
        assert(makeAwayAtFour(), .textUpdated(listening()), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[atFour.id] = nil
            $0.anchors[atFour.id] = nil
            $0.lines.rows = []
            $0.log = .lines($0.lines)
            $0.rendered = prepared()
        }
        #expect(spy.calls == [.line(4.0)])
    }

    @Test func returningEntryGetsAFreshIdentity() {

        let spy = RenderingSpy()
        assert(makeGiven(next: 1, followsLive: false), .textUpdated(listening(atFour)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[atFour.id] = atFour
            $0.anchors[atFour.id] = .init(id: 1, start: 4)
            $0.nextDisplayID = 2
            $0.lines.rows = [row(1, "line(4.0)", .mine)]
            $0.lines.newBelow = 1
            $0.log = .lines($0.lines)
            $0.rendered = prepared((atFour.id, shown(1, "line(4.0)", .mine), .init(row: 0)))
        }
        #expect(spy.calls == [.line(4.0)])
    }

    @Test func freeingASlotKeepsItsHold() {

        let spy = RenderingSpy()
        assert(makeSlotTaken(), .textUpdated(listening(still)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[heldDraft.id] = nil
            $0.anchors[heldDraft.id] = nil
            $0.lines.rows.removeFirst()
            $0.log = .lines($0.lines)
            $0.rendered = prepared((still.id, shown(1, "line(5.0)", .theirs, settled: "still here"), .init(row: 0)))
        }
        #expect(counted(spy.calls) == counted([.line(2.0), .line(5.0)]))
    }

    @Test func reusedSlotGetsAFreshTimeAndID() {

        let spy = RenderingSpy()
        assert(makeSlotFreed(), .textUpdated(listening(reused, still)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[reused.id] = reused
            $0.anchors[reused.id] = .init(id: 2, start: 12)
            $0.nextDisplayID = 3
            $0.lines.newBelow = 1
            $0.lines.rows.append(row(2, "line(12.0)", .mine, pending: "new speech"))
            $0.log = .lines($0.lines)
            $0.rendered = prepared((still.id, shown(1, "line(5.0)", .theirs, settled: "still here"), .init(row: 0)), (reused.id, shown(2, "line(12.0)", .mine, pending: "new speech"), .init(row: 1)))
        }
        #expect(counted(spy.calls) == counted([.line(5.0), .line(12.0)]))
    }

    @Test func reusedSlotSettlesInPlace() {

        let spy = RenderingSpy()
        assert(makeSlotReused(), .textUpdated(listening(still, reusedSettled)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.text[reusedSettled.id] = reusedSettled
            $0.lines.rows[1] = row(2, "line(12.0)", .mine, settled: "new speech")
            $0.log = .lines($0.lines)
            $0.rendered = prepared((still.id, shown(1, "line(5.0)", .theirs, settled: "still here"), .init(row: 0)), (reusedSettled.id, shown(2, "line(12.0)", .mine, settled: "new speech"), .init(row: 1)))
        }
        #expect(counted(spy.calls) == counted([.line(12.0), .line(5.0), .line(12.0)]))
    }
}

struct ReadingLogTests {

    @Test func nothingReadIsEmpty() {

        let spy = RenderingSpy()
        assert(makeState(), .jumpToLive, delivers: nil, using: makeReducer(spy))
        #expect(spy.calls == [])
    }

    @Test func recordingWithLiveTextOffKeepsNothing() {

        let spy = RenderingSpy()
        assert(makeLogState(recording: twelve), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .liveTextOff(kept: nil)
        }
        #expect(spy.calls == [])
    }

    @Test func recordingWithLiveTextOffKeepsHolds() {

        let spy = RenderingSpy()
        assert(makeLogState(holds: [heldFirst, heldSecond], recording: twelve), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .liveTextOff(kept: $0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func liveTextOffWithoutRecordingShowsHolds() {

        let spy = RenderingSpy()
        assert(makeLogState(holds: [heldFirst, heldSecond]), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func gettingReadyShowsHolds() {

        let spy = RenderingSpy()
        assert(makeLogState(.gettingReady, holds: [heldFirst, heldSecond]), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .preparing(holds: $0.lines.holds)
        }
        #expect(spy.calls == [])
    }

    @Test func gettingReadyShowsNoLines() {

        let spy = RenderingSpy()
        assert(makeLogState(.gettingReady, rows: [row(0, "line(1.0)", .mine, settled: "read so far")]), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .preparing(holds: [])
        }
        #expect(spy.calls == [])
    }

    @Test func recordingWithLiveTextOffKeepsLines() {

        let spy = RenderingSpy()
        assert(makeLogState(rows: [row(0, "line(1.0)", .mine, settled: "read so far")], recording: twelve), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .liveTextOff(kept: $0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test(arguments: [ReadingTextUpdate.Status.listening, .failed("could not restart"), .finished, .off])
    func availableLinesStayVisible(_ status: ReadingTextUpdate.Status) {

        let spy = RenderingSpy()
        assert(makeLogState(status, rows: [row(0, "line(1.0)", .mine, settled: "read so far")]), .jumpToLive, delivers: nil, using: makeReducer(spy)) {
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
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

private let twelve = ReadingState.Recording.on(elapsed: "recording(12.0)")

private let draft = text(.mine, 0, start: 8, pending: "draft")
private let first = text(.theirs, 0, start: 2, settled: "first")
// Recognition can revise a segment's timing as well as its words.
private let firm = text(.mine, 0, start: 1, settled: "firm", pending: " next")
private func makeCalled() -> ReadingState {

    makeGiven(
        [anchored(draft, 0), anchored(first, 1)],
        rows: [row(1, "line(2.0)", .theirs, settled: "first"), row(0, "line(8.0)", .mine, pending: "draft")], next: 2
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

    makeGiven([anchored(uncertain, 0)], rows: [row(0, "line(1.0)", .mine, pending: "uncertain words")], next: 1, holds: holds)
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

    makeGiven([anchored(pendingDraft, 0)], rows: [row(0, "line(10.0)", .mine, pending: "draft")], next: 1, followsLive: false)
}
private func makeAwaySettled() -> ReadingState {

    makeGiven([anchored(settledDraft, 0)], rows: [row(0, "line(10.0)", .mine, settled: "settled")], next: 1, followsLive: false)
}

private func makeArrivals(
    _ status: ReadingTextUpdate.Status = .listening, newBelow: Int = 2, followsLive: Bool = false
) -> ReadingState {

    makeGiven(
        [anchored(settledDraft, 0), anchored(next, 1), anchored(lateTheirs, 2)],
        rows: [
            .late(.init(span: "span[line(2.0)|line(3.0)]", entries: [shown(2, "line(2.0)", .theirs)])),
            row(0, "line(10.0)", .mine, settled: "settled"),
            row(1, "line(12.0)", .mine),
        ],
        next: 3, status: status, newBelow: newBelow, followsLive: followsLive
    )
}

private let readEntry = text(.mine, 0, start: 1, settled: "read so far")

private func makeReadSoFar(_ status: ReadingTextUpdate.Status = .listening, recording: ReadingState.Recording = twelve) -> ReadingState {

    makeGiven([anchored(readEntry, 0)], rows: [row(0, "line(1.0)", .mine, settled: "read so far")], next: 1, status: status, recording: recording)
}

private let transitions: [ReadingTextUpdate.Status] = [.off, .gettingReady, .failed("interrupted"), .finished]
private let toRevise = text(.mine, 0, start: 1, pending: "draft")
private let keep = text(.theirs, 0, start: 2, settled: "keep this")
private let revised = text(.mine, 0, start: 1, settled: "final words")
private let added = text(.mine, 1, start: 3, settled: "new words")
private func makeBeforeRevision() -> ReadingState {

    makeGiven(
        [anchored(toRevise, 0), anchored(keep, 1)],
        rows: [row(0, "line(1.0)", .mine, pending: "draft"), row(1, "line(2.0)", .theirs, settled: "keep this")], next: 2
    )
}

private let atFour = text(.mine, 1, start: 4)
private func makeAwayAtFour() -> ReadingState {

    makeGiven([anchored(atFour, 0)], rows: [row(0, "line(4.0)", .mine)], next: 1, followsLive: false)
}

private let heldDraft = text(.mine, 0, start: 2, pending: "held draft")
private let still = text(.theirs, 0, start: 5, settled: "still here")
private let reused = text(.mine, 0, start: 12, pending: "new speech")
private let reusedSettled = text(.mine, 0, start: 11, settled: "new speech")
private let slotHeld = ReadingState.Held(entryID: 0, text: "held draft")
private let stillRow = row(1, "line(5.0)", .theirs, settled: "still here")
private func makeSlotTaken() -> ReadingState {

    makeGiven(
        [anchored(heldDraft, 0), anchored(still, 1)], rows: [row(0, "line(2.0)", .mine, pending: "held draft"), stillRow],
        next: 2, holds: [slotHeld], followsLive: false
    )
}
private func makeSlotFreed() -> ReadingState {

    makeGiven([anchored(still, 1)], rows: [stillRow], next: 2, holds: [slotHeld], followsLive: false)
}
private func makeSlotReused() -> ReadingState {

    makeGiven(
        [anchored(still, 1), anchored(reused, 2)], rows: [stillRow, row(2, "line(12.0)", .mine, pending: "new speech")],
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
    using reducer: ReadingReducer,
    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout ReadingState) -> Void = { _ in }
) {
    var expected = state
    change(&expected)
    let result = reducer.reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(sealedParts(result.0) == sealedParts(expected), "sealed parts", sourceLocation: sourceLocation)
    #expect(renderedParts(result.0) == renderedParts(expected), "rendered cache and layout", sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}

/// The rendered cache and the layout count, which state equality also ignores.
private struct RenderedParts: Equatable {
    let prepared: Bool
    let ordered: [ReadingTextUpdate.Entry.ID]
    let entries: [ReadingTextUpdate.Entry.ID: ReadingState.Entry]
    let locations: [ReadingTextUpdate.Entry.ID: ReadingState.Rendered.Location]
    let layout: Int
    let logLayout: Int?
}

private func renderedParts(_ state: ReadingState) -> RenderedParts {

    let logLayout: Int? = switch state.log {
    case let .lines(lines): lines.layout
    case let .liveTextOff(kept): kept?.layout
    default: nil
    }
    return .init(prepared: state.rendered.prepared, ordered: state.rendered.ordered,
                 entries: state.rendered.entries.tail, locations: state.rendered.locations.tail,
                 layout: state.lines.layout, logLayout: logLayout)
}

/// What the state holds as sealed, and how many rendered entries its sealed rows
/// show. State equality ignores where its lists split, so `assert` compares this too.
private struct SealedParts: Equatable {
    let rows: [ReadingState.Row]
    let text: [ReadingTextUpdate.Entry.ID: ReadingTextUpdate.Entry]
    let anchors: [ReadingTextUpdate.Entry.ID: ReadingState.Anchor]
    let entries: [ReadingTextUpdate.Entry.ID: ReadingState.Entry]
    let locations: [ReadingTextUpdate.Entry.ID: ReadingState.Rendered.Location]
    let inSealedRows: Int
}

private func sealedParts(_ state: ReadingState) -> SealedParts {

    .init(rows: state.lines.rows.sealed, text: state.text.sealed, anchors: state.anchors.sealed,
          entries: state.rendered.entries.sealed, locations: state.rendered.locations.sealed,
          inSealedRows: state.rendered.inSealedRows)
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
