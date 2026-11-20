import Reading
import Testing

struct ReadingProblemTests {
    @Test func faultsAndWarningAreNewestFirstAndOnlyFaultsPersist() {
        let spy = RenderingSpy()
        let problems: [ReadingProblem] = [.init(.microphone, began: 3), .init(.callAudio, began: 6), .init(.callSilent, began: 8)]
        let state = ReadingState(captureBegan: true, rendered: .init(prepared: true))
        assert(state, .problemsChanged(problems), delivers: nil, using: makeReducer(spy)) {
            $0.problems = problems
            $0.banners = [.init(kind: .callSilent, time: "line(8.0)"), .init(kind: .callAudio, time: "line(6.0)"), .init(kind: .microphone, time: "line(3.0)")]
        }
        #expect(spy.calls == [.line(8), .line(6), .line(3)])
        var input = snapshot(state)
        input.problems = Array(problems.prefix(2))
        #expect(spy.layoutCalls == [.init(value: input, change: .rebuild)])
    }

    @Test(arguments: [
        ([ReadingProblem(.callSilent, began: 8)], [ReadingProblem]()),
        ([.init(.microphone, began: 3)], [.init(.microphone, began: 3)]),
        ([.init(.microphone, began: 3), .init(.callSilent, began: 8)], [.init(.microphone, began: 3)]),
    ])
    func layoutGetsOnlyProblemsThatLeaveAGap(problems: [ReadingProblem], gaps: [ReadingProblem]) {
        let spy = RenderingSpy()
        let state = ReadingState()
        _ = makeReducer(spy).reduce(state, .problemsChanged(problems))
        #expect(spy.layoutCalls.map(\.value.problems) == [gaps])
    }

    @Test func repeatedFaultKeepsItsFirstTimeAndDoesNotLayOutAgain() {
        let spy = RenderingSpy()
        let state = warned()
        assert(state, .problemsChanged([.init(.microphone, began: 99), .init(.callSilent, began: 100)]),
               delivers: nil, using: makeReducer(spy))
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func clearingWarningKeepsFaultsWithoutLayingOutAgain() {
        let spy = RenderingSpy()
        assert(warned(), .problemsChanged([]), delivers: nil, using: makeReducer(spy)) {
            $0.problems.removeLast()
            $0.banners.removeFirst()
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func recordingOffClearsFaultsAndUsesTheRebuiltRows() {
        let spy = RenderingSpy(result: { $0.rows = []; $0.revision = 12 })
        assert(warned(), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .off
            $0.problems = []
            $0.banners = []
            $0.lines.rows = []
            $0.lines.layout = 12
            $0.log = .empty
        }
        var input = snapshot(warned())
        input.problems = []
        #expect(spy.layoutCalls == [.init(value: input, change: .rebuild)])
        #expect(spy.calls.isEmpty)
    }

    @Test func equalTimesPutNewestBannerFirst() {
        let spy = RenderingSpy()
        let existing = ReadingProblem(.microphone, began: 3)
        let new = ReadingProblem(.diskFull(.theirs), began: 3)
        var state = ReadingState(captureBegan: true, problems: [existing], rendered: .init(prepared: true))
        state.banners = [.init(kind: .microphone, time: "given")]
        assert(state, .problemsChanged([existing, new]), delivers: nil, using: makeReducer(spy)) {
            $0.problems.append(new)
            $0.banners.insert(.init(kind: .diskFull(.theirs), time: "line(3.0)"), at: 0)
        }
        #expect(spy.calls == [.line(3)])
    }
}

private func warned() -> ReadingState {
    .init(banners: [.init(kind: .callSilent, time: "line(8.0)"), .init(kind: .microphone, time: "line(3.0)")],
          recording: .on(elapsed: "given"), captureBegan: true, log: .liveTextOff(kept: nil),
          problems: [.init(.microphone, began: 3), .init(.callSilent, began: 8)], rendered: .init(prepared: true))
}
