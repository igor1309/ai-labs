import CallDetail
import Testing

struct CallDetailReducerTests {
    @Test func firstSelection_state() {
        assert(makeEmpty(), .selectionChanged(makeCall())) {
            $0.selected = makeCall()
            $0.revision = 1
        }
    }
    @Test func firstSelection_effect() {
        assert(makeEmpty(), .selectionChanged(makeCall()), delivers: .read(id: "a", revision: 1))
    }

    @Test(arguments: ["a", "b"])
    func selectionKeepsShownDetailUntilReadAnswers_state(id: String) {
        assert(makeShown(), .selectionChanged(makeCall(id: id))) {
            $0.selected = makeCall(id: id)
            $0.notes = .notRead
            $0.revision += 1
        }
    }
    @Test(arguments: ["a", "b"])
    func selectionKeepsShownDetailUntilReadAnswers_effect(id: String) {
        assert(makeShown(), .selectionChanged(makeCall(id: id)), delivers: .read(id: id, revision: 8))
    }

    @Test func selectingNoneClearsImmediately_state() {
        assert(makeReading(), .selectionChanged(nil)) {
            $0.selected = nil
            $0.notes = .notRead
            $0.detail = nil
        }
    }
    @Test func selectingNoneClearsImmediately_effect() {
        assert(makeReading(), .selectionChanged(nil), delivers: nil)
    }

    @Test func selectingNoneWithoutASelection_state() { assert(makeEmpty(), .selectionChanged(nil)) }
    @Test func selectingNoneWithoutASelection_effect() { assert(makeEmpty(), .selectionChanged(nil), delivers: nil) }

    @Test(arguments: contentCases)
    fileprivate func readRendersContent_state(test: ContentCase) {
        assert(makeReading(summary: test.summary, editable: test.editable),
               .readFinished(id: "a", revision: 7, result: test.result)) {
            $0.notes = test.result
            $0.detail = .init(id: "a", title: "A title", date: "Today, 10:00", duration: "1:00", content: test.content)
        }
    }
    @Test(arguments: contentCases)
    fileprivate func readRendersContent_effect(test: ContentCase) {
        assert(makeReading(summary: test.summary, editable: test.editable),
               .readFinished(id: "a", revision: 7, result: test.result), delivers: nil)
    }

    @Test(arguments: changedSummaries)
    func summaryChangeReadsAgain_state(summary: CallDetailState.Call.Summary) {
        assert(makeShown(), .summaryChanged(id: "a", summary: summary)) {
            $0.selected?.summary = summary
            $0.notes = .notRead
            $0.revision += 1
        }
    }
    @Test(arguments: changedSummaries)
    func summaryChangeReadsAgain_effect(summary: CallDetailState.Call.Summary) {
        assert(makeShown(), .summaryChanged(id: "a", summary: summary), delivers: .read(id: "a", revision: 8))
    }

    @Test func notesChangeReadsAgain_state() {
        assert(makeShown(), .notesChanged(id: "a")) {
            $0.notes = .notRead
            $0.revision += 1
        }
    }
    @Test func notesChangeReadsAgain_effect() {
        assert(makeShown(), .notesChanged(id: "a"), delivers: .read(id: "a", revision: 8))
    }

    @Test func summaryChangeDuringReadSupersedesItsAnswer_state() {
        assert(makeReading(), .summaryChanged(id: "a", summary: makeFailed())) {
            $0.selected?.summary = makeFailed()
            $0.revision += 1
        }
    }
    @Test func summaryChangeDuringReadSupersedesItsAnswer_effect() {
        assert(makeReading(), .summaryChanged(id: "a", summary: makeFailed()), delivers: .read(id: "a", revision: 8))
    }

    @Test func notesChangeDuringReadSupersedesItsAnswer_state() {
        assert(makeReading(), .notesChanged(id: "a")) { $0.revision += 1 }
    }
    @Test func notesChangeDuringReadSupersedesItsAnswer_effect() {
        assert(makeReading(), .notesChanged(id: "a"), delivers: .read(id: "a", revision: 8))
    }

    @Test(arguments: ignoredCases)
    fileprivate func irrelevantOrStaleEvent_state(test: IgnoredCase) { assert(test.state(), test.event) }
    @Test(arguments: ignoredCases)
    fileprivate func irrelevantOrStaleEvent_effect(test: IgnoredCase) { assert(test.state(), test.event, delivers: nil) }
    @Test func openRequestWhileReadingWaits_state() {
        assert(makeReading(), .openRequested(id: "a")) { $0.pendingOpen = "a" }
    }
    @Test func openRequestWhileReadingWaits_effect() {
        assert(makeReading(), .openRequested(id: "a"), delivers: nil)
    }

    @Test func openRequestAfterReadOpensAtOnce_state() {
        assert(makeShown(), .openRequested(id: "a")) {
            $0.opened = "a"
            $0.opens += 1
        }
    }
    @Test func openRequestAfterReadOpensAtOnce_effect() {
        assert(makeShown(), .openRequested(id: "a"), delivers: nil)
    }

    @Test(arguments: [makeEmpty(), makeShown(), makeReading()])
    func openRequestForAnotherCallChangesNothing_state(given: CallDetailState) {
        assert(given, .openRequested(id: "b"))
    }
    @Test(arguments: [makeEmpty(), makeShown(), makeReading()])
    func openRequestForAnotherCallChangesNothing_effect(given: CallDetailState) {
        assert(given, .openRequested(id: "b"), delivers: nil)
    }

    @Test(arguments: contentCases)
    fileprivate func readAnswerOpensThePendingCall_state(test: ContentCase) {
        assert(makePendingOpen(summary: test.summary, editable: test.editable),
               .readFinished(id: "a", revision: 7, result: test.result)) {
            $0.notes = test.result
            $0.detail = .init(id: "a", title: "A title", date: "Today, 10:00", duration: "1:00", content: test.content)
            $0.pendingOpen = nil
            $0.opened = "a"
            $0.opens += 1
        }
    }
    @Test(arguments: contentCases)
    fileprivate func readAnswerOpensThePendingCall_effect(test: ContentCase) {
        assert(makePendingOpen(summary: test.summary, editable: test.editable),
               .readFinished(id: "a", revision: 7, result: test.result), delivers: nil)
    }

    @Test func supersededReadKeepsTheOpenPending_state() {
        assert(makePendingOpen(), .readFinished(id: "a", revision: 6, result: .absent))
    }
    @Test func supersededReadKeepsTheOpenPending_effect() {
        assert(makePendingOpen(), .readFinished(id: "a", revision: 6, result: .absent), delivers: nil)
    }

    @Test(arguments: [makeCall(id: "b"), nil])
    func anotherSelectionDropsThePendingOpen_state(call: CallDetailState.Call?) {
        assert(makePendingOpen(), .selectionChanged(call)) {
            $0.pendingOpen = nil
            $0.selected = call
            if call == nil { $0.detail = nil } else { $0.revision += 1 }
        }
    }
    @Test(arguments: [makeCall(id: "b"), nil])
    func anotherSelectionDropsThePendingOpen_effect(call: CallDetailState.Call?) {
        assert(makePendingOpen(), .selectionChanged(call), delivers: call.map { _ in .read(id: "b", revision: 8) })
    }

    @Test func reselectingThePendingCallKeepsIt_state() {
        assert(makePendingOpen(), .selectionChanged(makeCall())) { $0.revision += 1 }
    }
    @Test func reselectingThePendingCallKeepsIt_effect() {
        assert(makePendingOpen(), .selectionChanged(makeCall()), delivers: .read(id: "a", revision: 8))
    }
}

private func makePendingOpen(summary: CallDetailState.Call.Summary = makeSummary(.none), editable: Bool = true) -> CallDetailState {
    var state = makeReading(summary: summary, editable: editable)
    state.pendingOpen = "a"
    return state
}


private let changedSummaries: [CallDetailState.Call.Summary] = [
    makeSummary(.pending), makeFailed(),
    .init(badge: .none, status: "new status", canRetry: true),
    .init(badge: .none, status: "summary status", canRetry: false),
]

private struct ContentCase: Sendable {
    let summary: CallDetailState.Call.Summary
    let editable: Bool
    let result: CallDetailState.Notes
    let content: CallsDetail.Content
}

private let contentCases: [ContentCase] = {
    let badges: [CallDetailState.Call.Summary.Badge] = [.none, .pending, .failed]
    let notes: [ContentCase] = badges.flatMap { badge in
        [ContentCase(summary: makeSummary(badge), editable: true,
                     result: .read(text: "# Notes", made: "12:30"), content: .notes("# Notes", made: "12:30")),
         ContentCase(summary: makeSummary(badge), editable: false,
                     result: .read(text: "", made: nil), content: .notes("")),
         ContentCase(summary: makeSummary(badge), editable: true,
                     result: .unreadable(reason: "denied"), content: .unreadable("denied"))]
    }
    let failed = [true, false].flatMap { editable in
        [true, false].map { retry in
            ContentCase(summary: makeSummary(.failed, canRetry: retry), editable: editable,
                        result: .absent, content: .failed(reason: "summary status", canRetry: retry && editable))
        }
    }
    return notes + failed + [
        .init(summary: makeSummary(.pending), editable: true, result: .absent, content: .preparing),
        .init(summary: makeSummary(.none), editable: true, result: .absent, content: .none),
    ]
}()

private struct IgnoredCase: Sendable {
    let state: @Sendable () -> CallDetailState
    let event: CallDetailEvent
}

private let ignoredCases: [IgnoredCase] = [
    .init(state: { makeEmpty() }, event: .readFinished(id: "a", revision: 0, result: .absent)),
    .init(state: { makeReading() }, event: .readFinished(id: "b", revision: 7, result: .absent)),
    .init(state: { makeReading() }, event: .readFinished(id: "a", revision: 6, result: .read(text: "old", made: nil))),
    .init(state: { makeReading() }, event: .readFinished(id: "a", revision: 7, result: .notRead)),
    .init(state: { makeShown() }, event: .readFinished(id: "a", revision: 7, result: .absent)),
    .init(state: { makeEmpty() }, event: .summaryChanged(id: "a", summary: makeFailed())),
    .init(state: { makeShown() }, event: .summaryChanged(id: "b", summary: makeFailed())),
    .init(state: { makeShown() }, event: .summaryChanged(id: "a", summary: makeSummary(.none))),
    .init(state: { makeEmpty() }, event: .notesChanged(id: "a")),
    .init(state: { makeShown() }, event: .notesChanged(id: "b")),
]

private func makeEmpty() -> CallDetailState { .init() }

private func makeSummary(_ badge: CallDetailState.Call.Summary.Badge, canRetry: Bool = true) -> CallDetailState.Call.Summary {
    .init(badge: badge, status: "summary status", canRetry: canRetry)
}

private func makeFailed() -> CallDetailState.Call.Summary { makeSummary(.failed) }

private func makeCall(id: String = "a", summary: CallDetailState.Call.Summary = makeSummary(.none),
                      editable: Bool = true) -> CallDetailState.Call {
    .init(id: id, title: "A title", date: "Today, 10:00", duration: "1:00", editable: editable, summary: summary)
}

private func makeShown() -> CallDetailState {
    .init(selected: makeCall(), notes: .read(text: "old notes", made: nil),
          detail: .init(id: "a", title: "Old title", date: "Yesterday", duration: "0:59", content: .notes("old notes")), revision: 7)
}

private func makeReading(summary: CallDetailState.Call.Summary = makeSummary(.none), editable: Bool = true) -> CallDetailState {
    var state = makeShown()
    state.selected = makeCall(summary: summary, editable: editable)
    state.notes = .notRead
    return state
}

private func assert(_ state: CallDetailState, _ event: CallDetailEvent,
                    sourceLocation: SourceLocation = #_sourceLocation, mutation: (inout CallDetailState) -> Void = { _ in }) {
    var expected = state
    mutation(&expected)
    #expect(CallDetailReducer().reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(_ state: CallDetailState, _ event: CallDetailEvent, delivers effect: CallDetailEffect?,
                    sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(CallDetailReducer().reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
