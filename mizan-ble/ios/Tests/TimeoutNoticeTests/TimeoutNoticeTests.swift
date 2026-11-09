import Testing
import TimeoutNotice

struct TimeoutNoticeTests {
    @Test(arguments: [UInt64(0), 3, .max])
    func timeoutShowsNotice(_ number: UInt64) {
        let notice = TimeoutNotice.Notice(number: number)
        let state = TimeoutNotice.State()
        #expect(state.showing == nil)
        #expect(state.newest == nil)
        #expect(TimeoutNotice.seconds == 30)
        assert(state, .timedOut(notice), reducedTo: (notice, notice))
        assert(state, .timedOut(notice), effect: .start(notice, seconds: 30))
    }

    @Test func elapsedHidesNotice() {
        let notice = TimeoutNotice.Notice(number: 3)
        let state = showing(notice)
        assert(state, .elapsed(notice), reducedTo: (nil, notice))
        assert(state, .elapsed(notice), effect: nil)
    }

    @Test func actionHidesNotice() {
        let notice = TimeoutNotice.Notice(number: 3)
        let state = showing(notice)
        assert(state, .acted, reducedTo: (nil, notice))
        assert(state, .acted, effect: .stop(notice))
    }

    @Test func actionWithNoNoticeDoesNothing() {
        let notice = TimeoutNotice.Notice(number: 3)
        for state in [TimeoutNotice.State(), hidden(notice, by: .elapsed(notice)), hidden(notice, by: .acted)] {
            assert(state, .acted, reducedTo: (nil, state.newest))
            assert(state, .acted, effect: nil)
        }
    }

    @Test func newerTimeoutStartsFullWait() {
        for (older, newer): (UInt64, UInt64) in [(0, 1), (3, 4), (.max - 1, .max)] {
            let first = TimeoutNotice.Notice(number: older)
            let next = TimeoutNotice.Notice(number: newer)
            for state in [showing(first), hidden(first, by: .elapsed(first)), hidden(first, by: .acted)] {
                assert(state, .timedOut(next), reducedTo: (next, next))
                assert(state, .timedOut(next), effect: .start(next, seconds: 30))
            }
        }
    }

    @Test func unrelatedTimerCannotHideNotice() {
        let current = TimeoutNotice.Notice(number: 4)
        let state = showing(current)
        for number: UInt64 in [0, 3, 5, .max] {
            let other = TimeoutNotice.Notice(number: number)
            assert(state, .elapsed(other), reducedTo: (current, current))
            assert(state, .elapsed(other), effect: nil)
        }
    }

    @Test func timerAfterActionDoesNothing() {
        let notice = TimeoutNotice.Notice(number: 3)
        let state = hidden(notice, by: .acted)
        assert(state, .elapsed(notice), reducedTo: (nil, notice))
        assert(state, .elapsed(notice), effect: nil)
    }

    @Test func sameTimeoutKeepsFirstWait() {
        let notice = TimeoutNotice.Notice(number: 3)
        let state = showing(notice)
        assert(state, .timedOut(notice), reducedTo: (notice, notice))
        assert(state, .timedOut(notice), effect: nil)
    }

    @Test func sameTimeoutCannotRestoreHiddenNotice() {
        let notice = TimeoutNotice.Notice(number: 3)
        for event: TimeoutNotice.Event in [.elapsed(notice), .acted] {
            let state = hidden(notice, by: event)
            assert(state, .timedOut(notice), reducedTo: (nil, notice))
            assert(state, .timedOut(notice), effect: nil)
        }
    }

    @Test func olderTimeoutKeepsCurrentWait() {
        let notice = TimeoutNotice.Notice(number: .max)
        let state = showing(notice)
        for number: UInt64 in [0, 3, .max - 1] {
            let older = TimeoutNotice.Notice(number: number)
            assert(state, .timedOut(older), reducedTo: (notice, notice))
            assert(state, .timedOut(older), effect: nil)
        }
    }

    @Test func olderTimeoutCannotRestoreHiddenNotice() {
        let notice = TimeoutNotice.Notice(number: 4)
        for event: TimeoutNotice.Event in [.elapsed(notice), .acted] {
            let state = hidden(notice, by: event)
            let older = TimeoutNotice.Notice(number: 3)
            assert(state, .timedOut(older), reducedTo: (nil, notice))
            assert(state, .timedOut(older), effect: nil)
        }
    }

    @Test func timerWithNoNoticeDoesNothing() {
        let notice = TimeoutNotice.Notice(number: 3)
        for state in [TimeoutNotice.State(), hidden(notice, by: .elapsed(notice)), hidden(notice, by: .acted)] {
            for number: UInt64 in [0, 3, 4, .max] {
                let elapsed = TimeoutNotice.Notice(number: number)
                assert(state, .elapsed(elapsed), reducedTo: (nil, state.newest))
                assert(state, .elapsed(elapsed), effect: nil)
            }
        }
    }

    @MainActor @Test func effectsCallTimerBeforeReturningEmptyStreams() async {
        let first = TimeoutNotice.Notice(number: 3)
        let next = TimeoutNotice.Notice(number: 4)
        let timer = TimerSpy()
        let handler = TimeoutNotice.EffectHandler(timer: timer)
        let cases: [(TimeoutNotice.Effect, TimerSpy.Call)] = [
            (.start(first, seconds: 30), .start(first, seconds: 30)),
            (.start(next, seconds: 17), .start(next, seconds: 17)),
            (.stop(first), .stop(first)),
            (.stop(next), .stop(next)),
        ]
        var expected: [TimerSpy.Call] = []
        for (effect, call) in cases {
            let stream = handler.handle(effect)
            expected.append(call)
            #expect(timer.calls == expected)
            var events: [TimeoutNotice.Event] = []
            for await event in stream { events.append(event) }
            #expect(events == [])
        }
    }
}

private func showing(_ notice: TimeoutNotice.Notice) -> TimeoutNotice.State {
    TimeoutNotice.reduce(.init(), .timedOut(notice)).0
}

private func hidden(_ notice: TimeoutNotice.Notice, by event: TimeoutNotice.Event) -> TimeoutNotice.State {
    TimeoutNotice.reduce(showing(notice), event).0
}

private func assert(
    _ state: TimeoutNotice.State, _ event: TimeoutNotice.Event,
    reducedTo expected: (showing: TimeoutNotice.Notice?, newest: TimeoutNotice.Notice?),
    sourceLocation: SourceLocation = #_sourceLocation
) {
    let next = TimeoutNotice.reduce(state, event).0
    #expect(next.showing == expected.showing, sourceLocation: sourceLocation)
    #expect(next.newest == expected.newest, sourceLocation: sourceLocation)
}

private func assert(
    _ state: TimeoutNotice.State, _ event: TimeoutNotice.Event,
    effect expected: TimeoutNotice.Effect?, sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(TimeoutNotice.reduce(state, event).1 == expected, sourceLocation: sourceLocation)
}

@MainActor
private final class TimerSpy: TimeoutNotice.Timer {
    enum Call: Equatable {
        case start(TimeoutNotice.Notice, seconds: Int)
        case stop(TimeoutNotice.Notice)
    }

    private(set) var calls: [Call] = []

    func start(seconds: Int, for notice: TimeoutNotice.Notice) {
        calls.append(.start(notice, seconds: seconds))
    }

    func stop(_ notice: TimeoutNotice.Notice) {
        calls.append(.stop(notice))
    }
}
