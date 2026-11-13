import CallNotes
import Foundation
import Testing

struct CallNotesReducerTests {

    @Test func loadFromPendingStartsLoading_state() { assert(makeState(.pending), .load) { $0 = .loading } }
    @Test func loadFromPendingStartsLoading_effect() { assert(makeState(.pending), .load, delivers: .load) }

    @Test func loadFromFailureStartsLoading_state() { assert(makeState(failure), .load) { $0 = .loading } }
    @Test func loadFromFailureStartsLoading_effect() { assert(makeState(failure), .load, delivers: .load) }

    @Test func cancelWhileLoadingReturnsToPending_state() { assert(makeState(.loading), .cancel) { $0 = .pending } }
    @Test func cancelWhileLoadingReturnsToPending_effect() { assert(makeState(.loading), .cancel, delivers: .cancel) }

    @Test func loadedNotesCompleteWithRenderedDate_state() {

        let spy = DateSpy(stub: "12 ноября, 14:05")
        assert(makeState(.loading), .loaded(.success(loaded)), sut: makeSUT(date: spy)) {
            $0 = .completed(.init(text: "notes", date: "12 ноября, 14:05"))
        }
        #expect(spy.calls == [when])
    }

    @Test func loadedNotesCompleteWithRenderedDate_effect() { assert(makeState(.loading), .loaded(.success(loaded)), delivers: nil) }

    @Test func loadedFailureFails_state() { assert(makeState(.loading), .loaded(.failure(.init(reason: "why")))) { $0 = failure } }
    @Test func loadedFailureFails_effect() { assert(makeState(.loading), .loaded(.failure(.init(reason: "why"))), delivers: nil) }

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
private let loaded = CallNotesEvent.Loaded(text: "notes", date: when)
private let failure = CallNotesState.failure(.init(reason: "why"))
private let completed = CallNotesState.completed(.init(text: "notes", date: "date"))

private let states: [CallNotesState] = [.pending, .loading, completed, failure]
/// Outcomes carry other values than the given states, so a replaced value would show.
private let events: [CallNotesEvent] = [
    .load, .cancel, .loaded(.success(.init(text: "other", date: when))), .loaded(.failure(.init(reason: "other"))),
]

/// Every pair the reducer does not act on: load while loading, cancel when not
/// loading, an outcome when not loading, and anything sent to completed notes.
private let ignored: [(CallNotesState, CallNotesEvent)] = states.flatMap { state in
    events.compactMap { event in
        switch (state, event) {
        case (.pending, .load), (.failure, .load), (.loading, .cancel), (.loading, .loaded): nil
        default: (state, event)
        }
    }
}
