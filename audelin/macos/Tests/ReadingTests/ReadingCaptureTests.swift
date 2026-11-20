import Reading
import Testing

/// The log stays empty until capture first begins for the call; what arrives before is kept.
struct ReadingCaptureTests {
    @Test func textBeforeCaptureIsKeptWhileTheLogStaysEmpty() {
        let laidOut: [ReadingState.Row] = [.entry(shown), .entry(.init(id: 2, time: "stub", speaker: .mine, settled: "later"))]
        let spy = RenderingSpy(result: { $0.rows = .init(tail: laidOut); $0.revision = 3 })
        let state = makeBeforeCapture()
        let update = ReadingTextUpdate(status: .listening, entries: [text, later])
        assert(state, .textUpdated(update), delivers: nil, using: makeReducer(spy)) {
            $0.latestText = [text.id, later.id]
            $0.lines.rows = .init(tail: laidOut)
            $0.lines.layout = 3
        }
        #expect(spy.layoutCalls == [.init(value: snapshot(state), change: .text(update))])
        #expect(spy.calls.isEmpty)
    }

    @Test func problemsBeforeCaptureAreKeptWithoutBanners() {
        let spy = RenderingSpy()
        let state = makeBeforeCapture()
        let problems: [ReadingProblem] = [.init(.microphone, began: 3), .init(.callSilent, began: 8)]
        assert(state, .problemsChanged(problems), delivers: nil, using: makeReducer(spy)) {
            $0.problems = problems
        }
        var input = snapshot(state)
        input.problems = [problems[0]]
        #expect(spy.layoutCalls == [.init(value: input, change: .rebuild)])
        #expect(spy.calls.isEmpty)
    }

    @Test func namesBeforeCaptureAreKeptWhileTheLogStaysEmpty() {
        let spy = RenderingSpy()
        assert(makeBeforeCapture(), .namesChanged([4: "Ann"], confirmed: false), delivers: nil, using: makeReducer(spy)) {
            $0.names = [4: "Ann"]
        }
        #expect(spy.layoutCalls.isEmpty)
        #expect(spy.calls.isEmpty)
    }

    @Test func recordingOffBeforeCaptureKeepsTheLogEmpty() {
        let spy = RenderingSpy()
        assert(makeBeforeCapture(), .recordingChanged(.off), delivers: nil, using: makeReducer(spy))
        #expect(spy.layoutCalls.isEmpty)
        #expect(spy.calls.isEmpty)
    }

    @Test func firstCaptureShowsTheKeptTextAndBanners() {
        let spy = RenderingSpy()
        let problems: [ReadingProblem] = [.init(.microphone, began: 3), .init(.callSilent, began: 8)]
        assert(makeBeforeCapture(problems: problems), .recordingChanged(.on(elapsed: 5)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(5.0)")
            $0.captureBegan = true
            $0.banners = [.init(kind: .callSilent, time: "line(8.0)"), .init(kind: .microphone, time: "line(3.0)")]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.recording(5), .line(8), .line(3)])
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func recordingOffAfterCaptureBeganKeepsTheLogOpen() {
        let spy = RenderingSpy()
        assert(makeListening(entries: [text], rows: [.entry(shown)]), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .off
        }
        #expect(spy.layoutCalls.isEmpty)
        #expect(spy.calls.isEmpty)
    }

    @Test func captureBeginningAgainKeepsTheBanners() {
        let spy = RenderingSpy()
        let problems: [ReadingProblem] = [.init(.microphone, began: 3)]
        var state = makeListening(entries: [text], rows: [.entry(shown)], problems: problems,
                                  banners: [.init(kind: .microphone, time: "given")])
        state.recording = .off
        assert(state, .recordingChanged(.on(elapsed: 9)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(9.0)")
        }
        #expect(spy.calls == [.recording(9)])
        #expect(spy.layoutCalls.isEmpty)
    }
}

private let text = ReadingTextUpdate.Entry(id: .init(speaker: .mine, localID: 1), start: 1, end: 2, settled: "kept")
private let later = ReadingTextUpdate.Entry(id: .init(speaker: .mine, localID: 2), start: 3, end: 4, settled: "later")
private let shown = ReadingState.Entry(id: 1, time: "given", speaker: .mine, settled: "kept")

/// A call whose text arrived before capture began: its rows are laid out and its log is empty.
private func makeBeforeCapture(problems: [ReadingProblem] = []) -> ReadingState {
    var state = makeListening(entries: [text], rows: [.entry(shown)], problems: problems)
    state.recording = .off
    state.captureBegan = false
    state.log = .empty
    return state
}
