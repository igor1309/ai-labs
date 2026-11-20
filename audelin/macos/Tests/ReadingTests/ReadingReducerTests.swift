import Reading
import Testing

struct ReadingReducerTests {
    @Test func constructionCallsNoCollaborator() {
        let spy = RenderingSpy()
        _ = makeReducer(spy)
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func recordingOnUsesInjectedTimeWithoutLayingOutText() {
        let spy = RenderingSpy()
        assert(.init(), .recordingChanged(.on(elapsed: 3_661.9)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(3661.9)")
            $0.captureBegan = true
            $0.log = .liveTextOff(kept: nil)
        }
        #expect(spy.calls == [.recording(3_661.9)])
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [false, true])
    func layoutReceivesExactPayloadAndItsResultBecomesState(followsLive: Bool) {
        let id = ReadingTextUpdate.Entry.ID(speaker: .theirs, localID: 17)
        let text = ReadingTextUpdate.Entry(id: id, start: 3.9, end: 8, settled: " exact ", pending: " next", writtenLater: true)
        var state = ReadingState(captureBegan: true, problems: [.init(.microphone, began: 2)], status: .listening,
                                 anchors: [id: .init(id: 5, start: 1)], nextDisplayID: 6, text: [id: text],
                                 lines: .init(rows: [.entry(.init(id: 5, time: "given", speaker: .theirs))],
                                              layout: 4, holds: [.init(entryID: 5, text: "held")], newBelow: 7,
                                              followsLive: followsLive),
                                 rendered: .init(prepared: true, ordered: [id], inSealedRows: 0,
                                                 entries: [id: .init(id: 5, time: "given", speaker: .theirs)],
                                                 locations: [id: .init(row: 0)]))
        state.log = .lines(state.lines)
        let input = snapshot(state)
        let update = ReadingTextUpdate(status: .listening, entries: [text], from: 11, finalCount: 12)
        let output = ReadingLayout(anchors: .init(sealed: [id: .init(id: 8, start: 9)]), nextDisplayID: 9,
                                   text: .init(sealed: [id: text]),
                                   rendered: .init(prepared: true, ordered: [id], inSealedRows: 1,
                                                   entries: .init(sealed: [id: .init(id: 8, time: "stub", speaker: .mine)]),
                                                   locations: .init(sealed: [id: .init(row: 0)])),
                                   rows: .init(sealed: [.entry(.init(id: 8, time: "stub", speaker: .mine))]), revision: 23)
        let spy = RenderingSpy(result: { $0 = output })
        assert(state, .textUpdated(update), delivers: nil, using: makeReducer(spy)) {
            $0.latestText = [id]
            $0.anchors = output.anchors
            $0.nextDisplayID = output.nextDisplayID
            $0.text = output.text
            $0.rendered = output.rendered
            $0.lines.rows = output.rows
            $0.lines.layout = output.revision
            if !followsLive { $0.lines.newBelow += 3 }
            $0.log = .lines($0.lines)
        }
        #expect(spy.layoutCalls == [.init(value: input, change: .text(update))])
        #expect(spy.calls.isEmpty)
    }

    @Test func unpreparedLayoutIsPreparedBeforeTextIsSent() {
        let initial = ReadingState(captureBegan: true)
        let spy = RenderingSpy(result: { $0.rendered.prepared = true; $0.revision = 6 })
        let update = ReadingTextUpdate(status: .finished, entries: [])
        assert(initial, .textUpdated(update), delivers: nil, using: makeReducer(spy)) {
            $0.status = .finished
            $0.latestText = []
            $0.rendered.prepared = true
            $0.lines.layout = 6
            $0.log = .lines($0.lines)
        }
        var prepared = snapshot(initial)
        prepared.rendered.prepared = true
        prepared.revision = 6
        #expect(spy.layoutCalls == [.init(value: snapshot(initial), change: .prepare), .init(value: prepared, change: .text(update))])
    }

    @Test(arguments: [ReadingTextUpdate.Status.off, .gettingReady, .listening, .failed("unavailable"), .finished])
    func textStatusChoosesTheLog(status: ReadingTextUpdate.Status) {
        let spy = RenderingSpy()
        var state = ReadingState(captureBegan: true, status: .listening, rendered: .init(prepared: true))
        state.lines.holds = [.init(entryID: 4, text: " held ")]
        state.log = .lines(state.lines)
        assert(state, .textUpdated(.init(status: status, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.status = status
            $0.log = switch status {
            case .off: .lines($0.lines)
            case .gettingReady: .preparing(holds: $0.lines.holds)
            default: .lines($0.lines)
            }
        }
        #expect(spy.layoutCalls.map(\.change) == [.text(.init(status: status, entries: []))])
        #expect(spy.calls.isEmpty)
    }

    @Test func holdsPreserveExactTextAndIgnoreDuplicates() {
        let spy = RenderingSpy()
        let held = ReadingState.Held(entryID: 9, text: " exact \n text ")
        assert(.init(captureBegan: true), .hold(held), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = [held]
            $0.log = .lines($0.lines)
        }
        var state = ReadingState(captureBegan: true, lines: .init(holds: [held]))
        state.log = .lines(state.lines)
        assert(state, .hold(held), delivers: nil, using: makeReducer(spy))
        assert(state, .letGo(held), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = []
            $0.log = .empty
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func scrollingAndJumpingControlFollowingAndNewCount() {
        let spy = RenderingSpy()
        var state = ReadingState(captureBegan: true, status: .listening, lines: .init(newBelow: 8, followsLive: false))
        state.log = .lines(state.lines)
        for event: ReadingEvent in [.scrolled(atBottom: true), .jumpToLive] {
            assert(state, event, delivers: nil, using: makeReducer(spy)) {
                $0.lines.newBelow = 0
                $0.lines.followsLive = true
                $0.log = .lines($0.lines)
            }
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }
}

func snapshot(_ state: ReadingState) -> ReadingLayout {
    .init(anchors: state.anchors, nextDisplayID: state.nextDisplayID, text: state.text,
          rendered: state.rendered, rows: state.lines.rows, revision: state.lines.layout, problems: state.problems)
}
