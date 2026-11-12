import CallNotes
import Foundation
import Testing

struct CallNotesReducerTests {

    @Test func makeStartsMaking_state() { assert(makeState(.none), .make) { $0.status = .making } }
    @Test func makeStartsMaking_effect() { assert(makeState(.none), .make, delivers: .make) }

    @Test func retryStartsMaking_state() { assert(makeState(failed), .retry) { $0.status = .making } }
    @Test func retryStartsMaking_effect() { assert(makeState(failed), .retry, delivers: .make) }

    @Test func cancelReturnsToNone_state() { assert(makeState(.making), .cancel) { $0.status = .none } }
    @Test func cancelReturnsToNone_effect() { assert(makeState(.making), .cancel, delivers: .stop) }

    @Test func madeShowsNotesAndRenderedDate_state() {

        let spy = DateSpy(stub: "12 ноября, 14:05")
        assert(makeState(.making), .made(text: "notes", date: when), sut: makeSUT(date: spy)) {
            $0.status = .made(text: "notes", date: "12 ноября, 14:05")
        }
        #expect(spy.calls == [when])
    }

    @Test func madeShowsNotesAndRenderedDate_effect() { assert(makeState(.making), .made(text: "notes", date: when), delivers: nil) }

    @Test func failedShowsReason_state() { assert(makeState(.making), .failed(reason: "why")) { $0.status = .failed(reason: "why") } }
    @Test func failedShowsReason_effect() { assert(makeState(.making), .failed(reason: "why"), delivers: nil) }

    @Test func eventsThatCannotApplyChangeNothing_state() {

        for (state, event) in ignored { assert(makeState(state), event) }
    }

    @Test func eventsThatCannotApplyChangeNothing_effect() {

        for (state, event) in ignored { assert(makeState(state), event, delivers: nil) }
    }

    @Test func dateIsNotRenderedOnInitOrIgnoredEvents() {

        let spy = DateSpy()
        let sut = makeSUT(date: spy)
        for (state, event) in ignored { _ = sut.reduce(makeState(state), event) }
        #expect(spy.calls.isEmpty)
    }
}

private let when = Date(timeIntervalSince1970: 1_794_000_000)
private let failed = CallNotesState.Status.failed(reason: "why")
private let made = CallNotesState.Status.made(text: "notes", date: "date")

private let statuses: [CallNotesState.Status] = [.none, .making, made, failed]
private let events: [CallNotesEvent] = [.make, .cancel, .retry, .made(text: "other", date: when), .failed(reason: "other")]

private let applied: [(CallNotesState.Status, CallNotesEvent)] = [
    (.none, .make), (failed, .retry), (.making, .cancel),
    (.making, .made(text: "other", date: when)), (.making, .failed(reason: "other")),
]

/// Every pair the reducer does not act on: a second make or retry while making,
/// a late outcome after cancel, and anything sent to made notes. Outcomes carry
/// other text than the given state, so a replaced value would show.
private let ignored: [(CallNotesState.Status, CallNotesEvent)] = statuses.flatMap { status in
    events.compactMap { event in applied.contains { $0.0 == status && $0.1 == event } ? nil : (status, event) }
}
