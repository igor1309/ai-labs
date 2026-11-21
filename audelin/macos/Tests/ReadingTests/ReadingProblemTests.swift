import Reading
import Testing

struct ReadingProblemTests {
    @Test func faultsAndWarningAreNewestFirstAndOnlyFaultsPersist() {
        let spy = RenderingSpy()
        let existing: [ReadingProblem] = [.init(.microphone, began: 3), .init(.callAudio, began: 6)]
        let state = makeRecordingWithProblems(existing, banners: [
            .init(kind: .callAudio, time: "kept call audio"), .init(kind: .microphone, time: "kept microphone"),
        ])
        assert(state, .problemsChanged([], callSilent: true, at: 108.5), delivers: nil, using: makeReducer(spy)) {
            $0.problems.append(.init(.callSilent, began: 8.5))
            $0.banners.insert(.init(kind: .callSilent, time: "line(8.5)"), at: 0)
        }
        #expect(spy.calls == [.line(8.5)])
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [
        ([ReadingProblem.Kind](), true, [ReadingProblem]()),
        ([ReadingProblem.Kind.microphone], false, [ReadingProblem(.microphone, began: 3)]),
        ([ReadingProblem.Kind.microphone], true, [ReadingProblem(.microphone, began: 3)]),
    ])
    func layoutGetsOnlyProblemsThatLeaveAGap(kinds: [ReadingProblem.Kind], silent: Bool, gaps: [ReadingProblem]) {
        let spy = RenderingSpy()
        var state = makeRecordingWithProblems(prepared: false)
        state.displayedCall = 1
        _ = makeReducer(spy).reduce(state, .update(1, .problemsChanged(kinds, callSilent: silent, at: 103)))
        #expect(spy.layoutCalls.map(\.value.problems) == [gaps])
    }

    @Test func repeatedFaultKeepsItsFirstTimeAndDoesNotLayOutAgain() {
        let spy = RenderingSpy()
        let reducer = makeReducer(spy)
        let state = makeRecordingWithProblems()
        let first = makeRecordingWithProblems(
            [.init(.microphone, began: 3.25)],
            banners: [.init(kind: .microphone, time: "line(3.25)")]
        )
        assert(state, .problemsChanged([.microphone], callSilent: false, at: 103.25), delivers: nil, using: reducer) {
            $0.problems = first.problems
            $0.banners = first.banners
        }
        assert(first, .problemsChanged([.microphone], callSilent: false, at: 200), delivers: nil, using: reducer)
        #expect(spy.calls == [.line(3.25)])
        #expect(spy.layoutCalls == [.init(value: snapshot(first), change: .rebuild)])
    }

    @Test func clearingWarningKeepsFaultsWithoutLayingOutAgain() {
        let spy = RenderingSpy()
        assert(makeWarned(), .problemsChanged([], callSilent: false, at: 109), delivers: nil, using: makeReducer(spy)) {
            $0.problems.removeLast()
            $0.banners.removeFirst()
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func recordingOffClearsFaultsAndUsesTheRebuiltRows() {
        let spy = RenderingSpy(result: { $0.rows = []; $0.revision = 12 })
        assert(makeWarned(), .recordingChanged(.off, at: 109), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .off
            $0.recordingStart = nil
            $0.lastTick = nil
            $0.problems = []
            $0.banners = []
            $0.lines.rows = []
            $0.lines.layout = 12
            $0.log = .empty
        }
        var input = snapshot(makeWarned())
        input.problems = []
        #expect(spy.layoutCalls == [.init(value: input, change: .rebuild)])
        #expect(spy.calls.isEmpty)
    }

    @Test func equalTimesPutNewestBannerFirst() {
        let spy = RenderingSpy()
        let existing = ReadingProblem(.microphone, began: 3)
        let new = ReadingProblem(.diskFull(.theirs), began: 3)
        let state = makeRecordingWithProblems([existing], banners: [.init(kind: .microphone, time: "given")])
        assert(state, .problemsChanged([.microphone, .diskFull(.theirs)], callSilent: false, at: 103), delivers: nil, using: makeReducer(spy)) {
            $0.problems.append(new)
            $0.banners.insert(.init(kind: .diskFull(.theirs), time: "line(3.0)"), at: 0)
        }
        #expect(spy.calls == [.line(3)])
    }
}

private func makeRecordingWithProblems(
    _ problems: [ReadingProblem] = [], banners: [ReadingState.Banner] = [], prepared: Bool = true
) -> ReadingState {
    .init(banners: banners, recording: .on(elapsed: "given"), recordingStart: 100, lastTick: 108,
          captureBegan: true, log: .liveTextOff(kept: nil), problems: problems, rendered: .init(prepared: prepared))
}

private func makeWarned() -> ReadingState {
    makeRecordingWithProblems(
        [.init(.microphone, began: 3), .init(.callSilent, began: 8)],
        banners: [.init(kind: .callSilent, time: "line(8.0)"), .init(kind: .microphone, time: "line(3.0)")]
    )
}
