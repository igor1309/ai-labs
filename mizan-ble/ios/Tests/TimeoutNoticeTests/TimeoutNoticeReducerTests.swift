import Testing
import TimeoutNotice

private typealias State = TimeoutNotice.State
private typealias Event = TimeoutNotice.Event
private typealias Effect = TimeoutNotice.Effect

private let notice = TimeoutNotice.Notice(number: 3)

struct TimeoutNoticeReducerTests {
    @Test func startsWithNoNotice() {
        #expect(State() == makeState(showing: nil, newest: nil))
        #expect(TimeoutNotice.seconds == 30)
    }

    // MARK: - Timeout

    @Test(arguments: [UInt64(0), 3, .max])
    func firstTimeoutShowsItsNoticeForTheFullWait(number: UInt64) {
        let timeout = TimeoutNotice.Notice(number: number)
        let state = makeState()

        assert(state, .timedOut(timeout)) {
            $0.showing = timeout
            $0.newest = timeout
        }
        assert(state, .timedOut(timeout), delivers: .start(timeout, seconds: 30))
    }

    @Test(arguments: [(0, 1), (3, 4), (UInt64.max - 1, UInt64.max)] as [(UInt64, UInt64)], [true, false])
    func newerTimeoutShowsItsNoticeForTheFullWait(numbers: (UInt64, UInt64), showing: Bool) {
        let older = TimeoutNotice.Notice(number: numbers.0)
        let newer = TimeoutNotice.Notice(number: numbers.1)
        let state = makeState(showing: showing ? older : nil, newest: older)

        assert(state, .timedOut(newer)) {
            $0.showing = newer
            $0.newest = newer
        }
        assert(state, .timedOut(newer), delivers: .start(newer, seconds: 30))
    }

    @Test(arguments: [UInt64(0), 2, 3], [true, false])
    func sameOrOlderTimeoutIsIgnored(number: UInt64, showing: Bool) {
        let state = makeState(showing: showing ? notice : nil, newest: notice)

        assert(state, .timedOut(.init(number: number)))
        assert(state, .timedOut(.init(number: number)), delivers: nil)
    }

    // MARK: - Hiding

    @Test func elapsedHidesTheNoticeAndKeepsItNewest() {
        let state = makeState(showing: notice, newest: notice)

        assert(state, .elapsed(notice)) { $0.showing = nil }
        assert(state, .elapsed(notice), delivers: nil)
    }

    @Test(arguments: [UInt64(0), 2, 4, .max])
    func elapsedForAnotherNoticeIsIgnored(number: UInt64) {
        let state = makeState(showing: notice, newest: notice)

        assert(state, .elapsed(.init(number: number)))
        assert(state, .elapsed(.init(number: number)), delivers: nil)
    }

    @Test(arguments: [UInt64(0), 3, 4, .max], [nil, notice])
    func elapsedWithNoNoticeShowingIsIgnored(number: UInt64, newest: TimeoutNotice.Notice?) {
        let state = makeState(showing: nil, newest: newest)

        assert(state, .elapsed(.init(number: number)))
        assert(state, .elapsed(.init(number: number)), delivers: nil)
    }

    @Test func actionHidesTheNoticeAndStopsItsWait() {
        let state = makeState(showing: notice, newest: notice)

        assert(state, .acted) { $0.showing = nil }
        assert(state, .acted, delivers: .stop(notice))
    }

    @Test(arguments: [nil, notice])
    func actionWithNoNoticeShowingIsIgnored(newest: TimeoutNotice.Notice?) {
        let state = makeState(showing: nil, newest: newest)

        assert(state, .acted)
        assert(state, .acted, delivers: nil)
    }
}

// MARK: - Helpers

private func makeState(showing: TimeoutNotice.Notice? = nil, newest: TimeoutNotice.Notice? = nil) -> State {
    State(showing: showing, newest: newest)
}

private func assert(
    _ state: State,
    _ event: Event,
    sourceLocation: SourceLocation = #_sourceLocation,
    _ update: (inout State) -> Void = { _ in }
) {
    var expected = state
    update(&expected)
    #expect(TimeoutNotice.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(
    _ state: State,
    _ event: Event,
    delivers effect: Effect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(TimeoutNotice.reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
