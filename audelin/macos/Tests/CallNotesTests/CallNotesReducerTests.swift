import CallNotes
import Foundation
import Testing

struct CallNotesReducerTests {

    @Test func makeStartsNextRun_state() { assert(makeState(.none, run: 1), .make) { $0.status = .making; $0.run = 2 } }
    @Test func makeStartsNextRun_effect() { assert(makeState(.none, run: 1), .make, delivers: .make(run: 2)) }

    @Test func retryStartsNextRun_state() { assert(makeState(failed, run: 1), .retry) { $0.status = .making; $0.run = 2 } }
    @Test func retryStartsNextRun_effect() { assert(makeState(failed, run: 1), .retry, delivers: .make(run: 2)) }

    @Test func cancelReturnsToNone_state() { assert(makeState(.making), .cancel) { $0.status = .none } }
    @Test func cancelReturnsToNone_effect() { assert(makeState(.making), .cancel, delivers: .stop) }

    @Test func madeShowsNotesAndRenderedDate_state() {

        let spy = DateSpy(stub: "12 ноября, 14:05")
        assert(makeState(.making, run: 1), .made(run: 1, text: "notes", date: when), sut: makeSUT(date: spy)) {
            $0.status = .made(text: "notes", date: "12 ноября, 14:05")
        }
        #expect(spy.calls == [when])
    }

    @Test func madeShowsNotesAndRenderedDate_effect() { assert(makeState(.making, run: 1), .made(run: 1, text: "notes", date: when), delivers: nil) }

    @Test func failedShowsReason_state() { assert(makeState(.making, run: 1), .failed(run: 1, reason: "why")) { $0.status = .failed(reason: "why") } }
    @Test func failedShowsReason_effect() { assert(makeState(.making, run: 1), .failed(run: 1, reason: "why"), delivers: nil) }

    @Test func outcomeOfAnEarlierRunChangesNothing_state() {

        assert(makeState(.making, run: 2), .made(run: 1, text: "other", date: when))
        assert(makeState(.making, run: 2), .failed(run: 1, reason: "other"))
    }

    @Test func outcomeOfAnEarlierRunChangesNothing_effect() {

        assert(makeState(.making, run: 2), .made(run: 1, text: "other", date: when), delivers: nil)
        assert(makeState(.making, run: 2), .failed(run: 1, reason: "other"), delivers: nil)
    }

    @Test func eventsThatCannotApplyChangeNothing_state() {

        for (state, event) in ignored { assert(makeState(state, run: 1), event) }
    }

    @Test func eventsThatCannotApplyChangeNothing_effect() {

        for (state, event) in ignored { assert(makeState(state, run: 1), event, delivers: nil) }
    }

    @Test func dateIsNotRenderedOnInitOrIgnoredEvents() {

        let spy = DateSpy()
        let sut = makeSUT(date: spy)
        for (state, event) in ignored { _ = sut.reduce(makeState(state, run: 1), event) }
        _ = sut.reduce(makeState(.making, run: 2), .made(run: 1, text: "other", date: when))
        #expect(spy.calls.isEmpty)
    }
}

private let when = Date(timeIntervalSince1970: 1_794_000_000)
private let failed = CallNotesState.Status.failed(reason: "why")
private let made = CallNotesState.Status.made(text: "notes", date: "date")

private let statuses: [CallNotesState.Status] = [.none, .making, made, failed]
private let events: [CallNotesEvent] = [.make, .cancel, .retry, .made(run: 1, text: "other", date: when), .failed(run: 1, reason: "other")]

private let applied: [(CallNotesState.Status, CallNotesEvent)] = [
    (.none, .make), (failed, .retry), (.making, .cancel),
    (.making, .made(run: 1, text: "other", date: when)), (.making, .failed(run: 1, reason: "other")),
]

/// Every pair the reducer does not act on: a second make or retry while making,
/// a late outcome after cancel, and anything sent to made notes. Outcomes carry
/// other text than the given state, so a replaced value would show.
private let ignored: [(CallNotesState.Status, CallNotesEvent)] = statuses.flatMap { status in
    events.compactMap { event in applied.contains { $0.0 == status && $0.1 == event } ? nil : (status, event) }
}
