import Reading
import Synchronization
import Testing

struct ReadingRenderingTests {

    @Test func constructionDoesNotRenderOrChooseALog() {
        let spy = RenderingSpy()
        _ = makeReducer(spy)
        let state = ReadingState(recording: .on(elapsed: "given"), status: .listening,
                                 lines: .init(holds: [.init(entryID: 9, text: " exact ")]))
        #expect(state.log == .empty)
        #expect(spy.calls == [])
    }

    @Test func recordingUsesInjectedTime() {
        let spy = RenderingSpy()
        let state = makeState()
        assert(state, .recordingChanged(.on(elapsed: 3_661.9)), delivers: nil, using: makeReducer(spy)) {
            $0.recording = .on(elapsed: "recording(3661.9)")
            $0.log = .liveTextOff(kept: nil)
        }
        #expect(spy.calls == [.recording(3_661.9)])
    }

    @Test func entriesAndLateSpanUseInjectedStrings() {
        let spy = RenderingSpy()
        let first = makeText(0, start: 61.9, end: 80, late: true)
        let second = makeText(1, start: 65, end: 70, late: true)
        let last = makeText(2, start: 90, end: 91)
        assert(makeState(), .textUpdated(.init(status: .listening, entries: [first, second, last])), delivers: nil, using: makeReducer(spy)) {
            $0.status = .listening
            $0.nextDisplayID = 3
            for text in [first, second, last] {
                $0.anchors[text.id] = .init(id: text.id.localID, start: text.start)
                $0.text[text.id] = text
            }
            $0.lines.rows = [
                .late(.init(span: "span[line(61.9)|line(80.0)]", entries: [
                    makeEntry(0, time: "line(61.9)"), makeEntry(1, time: "line(65.0)"),
                ])),
                .entry(makeEntry(2, time: "line(90.0)")),
            ]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(61.9), .line(65), .line(90), .line(61.9), .line(80),
                              .span("line(61.9)", "line(80.0)")])
    }

    @Test func revisionsFormatTheOriginalAnchor() {
        let spy = RenderingSpy()
        let text = makeText(0, start: 99, end: 100)
        let state = makePreparedState()
        assert(state, .textUpdated(.init(status: .listening, entries: [text])), delivers: nil, using: makeReducer(spy)) {
            $0.text[text.id] = text
            $0.lines.rows = [.entry(makeEntry(0, time: "line(2.0)"))]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(2)])
    }

    @Test func unpreparedPublicStateFormatsAtItsAnchor() {
        let spy = RenderingSpy()
        var state = makePreparedState()
        state.rendered = .init()
        assert(state, .textUpdated(.init(status: .finished, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.status = .finished
            $0.lines.rows = [.entry(makeEntry(0, time: "line(2.0)"))]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(2)])
    }

    @Test func bannersGapsAndSplitSpansUseInjectedStrings() {
        let spy = RenderingSpy()
        let first = makeText(0, start: 2, end: 8, late: true)
        let last = makeText(1, start: 6, end: 7, late: true)
        let state = makeLateState(first, last)
        let problems: [ReadingProblem] = [.init(.microphone, began: 4), .init(.callSilent, began: 9)]
        assert(state, .problemsChanged(problems), delivers: nil, using: makeReducer(spy)) {
            $0.problems = problems
            $0.banners = [.init(kind: .callSilent, time: "line(9.0)"), .init(kind: .microphone, time: "line(4.0)")]
            $0.lines.rows = [
                .late(.init(span: "span[line(2.0)|line(8.0)]", entries: [makeEntry(0, time: "given first")])),
                .gap(.init(speaker: .mine, time: "line(4.0)", kind: .microphone)),
                .late(.init(span: "span[line(6.0)|line(7.0)]", entries: [makeEntry(1, time: "given last")])),
            ]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(9), .line(4), .line(2), .line(8), .span("line(2.0)", "line(8.0)"),
                              .line(4), .line(6), .line(7), .span("line(6.0)", "line(7.0)")])
    }

    @Test func stoppingReformatsOnlyTheJoinedSpan() {
        let spy = RenderingSpy()
        let first = makeText(0, start: 2, end: 8, late: true)
        let last = makeText(1, start: 6, end: 7, late: true)
        var state = makeLateState(first, last)
        state.problems = [.init(.microphone, began: 4)]
        state.banners = [.init(kind: .microphone, time: "given fault")]
        state.lines.rows = [
            .late(.init(span: "before", entries: [makeEntry(0, time: "given first")])),
            .gap(.init(speaker: .mine, time: "given gap", kind: .microphone)),
            .late(.init(span: "after", entries: [makeEntry(1, time: "given last")])),
        ]
        state.log = .lines(state.lines)
        assert(state, .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.problems = []
            $0.banners = []
            $0.lines.rows = [.late(.init(span: "span[line(2.0)|line(8.0)]", entries: [
                makeEntry(0, time: "given first"), makeEntry(1, time: "given last"),
            ]))]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [.line(2), .line(8), .span("line(2.0)", "line(8.0)")])
    }

    @Test func holdingPreservesExactTextWithoutFormatting() {
        let spy = RenderingSpy()
        let held = ReadingState.Held(entryID: 0, text: " exact \n text ")
        assert(makePreparedState(), .hold(held), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = [held]
            $0.log = .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test(arguments: [ReadingTextUpdate.Status.off, .gettingReady, .failed("unavailable"), .finished])
    func statusChangesDoNotReformatCachedEntries(_ status: ReadingTextUpdate.Status) {
        let spy = RenderingSpy()
        assert(makePreparedState(), .textUpdated(.init(status: status, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.status = status
            $0.log = status == .gettingReady ? .preparing(holds: []) : .lines($0.lines)
        }
        #expect(spy.calls == [])
    }

    @Test func unchangedLateTextDoesNotFormatTimesOrSpans() {
        let spy = RenderingSpy()
        let first = makeText(0, start: 2, end: 8, late: true)
        let last = makeText(1, start: 6, end: 7, late: true)
        assert(makeLateState(first, last), .textUpdated(.init(status: .listening, entries: [first, last])),
               delivers: nil, using: makeReducer(spy))
        #expect(spy.calls == [])
    }

    @Test func interactionsAndUnchangedTextDoNotRender() {
        let held = ReadingState.Held(entryID: 0, text: " exact \n text ")
        var state = makePreparedState()
        state.lines.holds = [held]
        state.log = .lines(state.lines)
        let events: [ReadingEvent] = [.hold(held), .letGo(.init(entryID: 4, text: "absent")),
                                      .scrolled(atBottom: true), .jumpToLive,
                                      .textUpdated(.init(status: .listening, entries: [makeText(0, start: 2, end: 3)]))]
        for event in events {
            let spy = RenderingSpy()
            assert(state, event, delivers: nil, using: makeReducer(spy))
            #expect(spy.calls == [])
        }
    }
}

private final class RenderingSpy: Sendable {
    enum Call: Equatable, Sendable {
        case recording(Double), line(Double), span(String, String)
    }
    private let storage = Mutex<[Call]>([])
    var calls: [Call] { storage.withLock { $0 } }
    func recording(_ value: Double) -> String {
        storage.withLock { $0.append(.recording(value)) }
        return "recording(\(value))"
    }
    func line(_ value: Double) -> String {
        storage.withLock { $0.append(.line(value)) }
        return "line(\(value))"
    }
    func span(_ start: String, _ end: String) -> String {
        storage.withLock { $0.append(.span(start, end)) }
        return "span[\(start)|\(end)]"
    }
}

private func makeReducer(_ spy: RenderingSpy) -> ReadingReducer {
    .init(recordingTime: { spy.recording($0) }, lineTime: { spy.line($0) }, span: { spy.span($0, $1) })
}

private func makeState() -> ReadingState { .init() }

private func makeText(_ id: Int, start: Double, end: Double, late: Bool = false) -> ReadingTextUpdate.Entry {
    .init(id: .init(speaker: .mine, localID: id), start: start, end: end, writtenLater: late)
}

private func makeEntry(_ id: Int, time: String) -> ReadingState.Entry {
    .init(id: id, time: time, speaker: .mine, settled: "", pending: "")
}

private func makePreparedState() -> ReadingState {
    let text = makeText(0, start: 2, end: 3)
    let entry = makeEntry(0, time: "given")
    let lines = ReadingState.Lines(rows: [.entry(entry)])
    return .init(log: .lines(lines), status: .listening, anchors: [text.id: .init(id: 0, start: 2)],
                 nextDisplayID: 1, text: [text.id: text], lines: lines,
                 rendered: .init(prepared: true, ordered: [text.id], entries: [text.id: entry],
                                 locations: [text.id: .init(row: 0, lateEntry: nil)]),
                 work: .init(entryOrderComparisons: 12, rowsBuilt: 34))
}

private func makeLateState(_ first: ReadingTextUpdate.Entry, _ last: ReadingTextUpdate.Entry) -> ReadingState {
    let entries = [makeEntry(0, time: "given first"), makeEntry(1, time: "given last")]
    let lines = ReadingState.Lines(rows: [.late(.init(span: "given span", entries: entries))])
    return .init(log: .lines(lines), status: .listening,
                 anchors: [first.id: .init(id: 0, start: 2), last.id: .init(id: 1, start: 6)], nextDisplayID: 2,
                 text: [first.id: first, last.id: last], lines: lines,
                 rendered: .init(prepared: true, ordered: [first.id, last.id],
                                 entries: [first.id: entries[0], last.id: entries[1]]))
}

private func assert(
    _ state: ReadingState, _ event: ReadingEvent, delivers effect: Never?, using reducer: ReadingReducer,
    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout ReadingState) -> Void = { _ in }
) {
    var expected = state
    change(&expected)
    let result = reducer.reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}
