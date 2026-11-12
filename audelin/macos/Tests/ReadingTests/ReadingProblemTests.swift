import Testing
import Reading

struct ReadingProblemTests {

    @Test func faultsAndWarningAreNewestFirst() {

        let spy = RenderingSpy()
        assert(makeState(), .problemsChanged(problems), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.problems = problems
            $0.banners = [
                .init(kind: .callSilent, time: "line(8.0)"), .init(kind: .diskFull(.theirs), time: "line(7.0)"),
                .init(kind: .callAudio, time: "line(6.0)"), .init(kind: .microphone, time: "line(3.0)"),
            ]
            $0.lines.rows = [.entry(first), gaps[0], .entry(last), gaps[1], gaps[2]]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(8), .line(7), .line(6), .line(3), .line(5), .line(2), .line(3), .line(6), .line(7)]))
    }

    @Test func clearingWarningKeepsFaultsAndGaps() {

        let spy = RenderingSpy()
        assert(makeWarned(), .problemsChanged([]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.problems.removeAll { $0.kind == .callSilent }
            $0.banners.removeFirst()
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(2), .line(5), .line(3), .line(6), .line(7)]))
    }

    @Test func repeatedFaultKeepsItsFirstTime() {

        let spy = RenderingSpy()
        assert(makeFaulted(), .problemsChanged([.init(.microphone, began: 99)]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(5), .line(2), .line(3), .line(6), .line(7)]))
    }

    @Test func recordingOffClearsProblemsAndGaps() {

        let spy = RenderingSpy()
        assert(makeWarned(), .recordingChanged(.off), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.recording = .off
            $0.problems = []
            $0.banners = []
            $0.lines.rows = [.entry(first), .entry(last)]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 1)))
        }
        #expect(counted(spy.calls) == counted([.line(2), .line(5)]))
    }

    @Test func gapsSplitLateGroupsAtTheirTime() {

        let spy = RenderingSpy()
        assert(makeState(late: true, rows: [.late(.init(span: "span[line(2.0)|line(6.0)]", entries: [first, last]))]),
               .problemsChanged([microphone]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.problems = [microphone]
            $0.banners = [.init(kind: .microphone, time: "line(3.0)")]
            $0.lines.rows = [
                .late(.init(span: "span[line(2.0)|line(3.0)]", entries: [first])), gaps[0],
                .late(.init(span: "span[line(5.0)|line(6.0)]", entries: [last])),
            ]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0, lateEntry: 0)), (lastID, last, .init(row: 2, lateEntry: 0)))
        }
        #expect(counted(spy.calls) == counted([.line(3), .line(2), .line(5), .line(2), .line(3), .span("line(2.0)", "line(3.0)"),
                             .line(3), .line(5), .line(6), .span("line(5.0)", "line(6.0)")]))
    }

    @Test func lateTextKeepsTheGapAtItsTime() {

        let spy = RenderingSpy()
        assert(makeFaulted(), .textUpdated(update(late: true)), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 2
            for entry in update(late: true).entries { $0.text[entry.id] = entry }
            $0.lines.rows = [
                .late(.init(span: "span[line(2.0)|line(3.0)]", entries: [first])), gaps[0],
                .late(.init(span: "span[line(5.0)|line(6.0)]", entries: [last])), gaps[1], gaps[2],
            ]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0, lateEntry: 0)), (lastID, last, .init(row: 2, lateEntry: 0)))
        }
        #expect(counted(spy.calls) == counted([.line(5), .line(2), .line(3), .line(6), .line(7), .line(2), .line(5),
                             .line(2), .line(3), .span("line(2.0)", "line(3.0)"), .line(3), .line(5), .line(6),
                             .span("line(5.0)", "line(6.0)"), .line(6), .line(7)]))
    }

    @Test func warningAloneHasNoGap() {

        let spy = RenderingSpy()
        assert(makeState(), .problemsChanged([silent]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.problems = [silent]
            $0.banners = [.init(kind: .callSilent, time: "line(8.0)")]
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 1)))
        }
        #expect(counted(spy.calls) == counted([.line(8), .line(5), .line(2)]))
    }

    @Test func gapsAndTextStayVisibleDuringPreparation() {

        let spy = RenderingSpy()
        assert(makeFaulted(), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.status = .gettingReady
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 2)))
        }
        #expect(counted(spy.calls) == counted([.line(2), .line(5), .line(3), .line(6), .line(7)]))
    }

    @Test func equalProblemTimesPutTheNewestBannerFirst() {

        let spy = RenderingSpy()
        let existing = ReadingProblem(.callAudio, began: 3)
        let new = ReadingProblem(.diskFull(.mine), began: 3)
        assert(makeState(problems: [existing], banners: [.init(kind: .callAudio, time: "line(3.0)")],
                         rows: [.entry(first), .gap(.init(speaker: .theirs, time: "line(3.0)", kind: .callAudio)), .entry(last)]),
               .problemsChanged([existing, new]), delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.problems.append(new)
            $0.banners.insert(.init(kind: .diskFull(.mine), time: "line(3.0)"), at: 0)
            $0.lines.rows.insert(.gap(.init(speaker: .mine, time: "line(3.0)", kind: .diskFull(.mine))), at: 2)
            $0.log = .lines($0.lines)
            $0.rendered = prepared((firstID, first, .init(row: 0)), (lastID, last, .init(row: 3)))
        }
        #expect(counted(spy.calls) == counted([.line(3), .line(5), .line(2), .line(3), .line(3)]))
    }
}

private let microphone = ReadingProblem(.microphone, began: 3)
private let callAudio = ReadingProblem(.callAudio, began: 6)
private let disk = ReadingProblem(.diskFull(.theirs), began: 7)
private let silent = ReadingProblem(.callSilent, began: 8)
private let problems = [callAudio, silent, microphone, disk]
private let gaps: [ReadingState.Row] = [
    .gap(.init(speaker: .mine, time: "line(3.0)", kind: .microphone)),
    .gap(.init(speaker: .theirs, time: "line(6.0)", kind: .callAudio)),
    .gap(.init(speaker: .theirs, time: "line(7.0)", kind: .diskFull(.theirs))),
]
private let firstID = ReadingTextUpdate.Entry.ID(speaker: .mine, localID: 1)
private let lastID = ReadingTextUpdate.Entry.ID(speaker: .theirs, localID: 1)
private let first = ReadingState.Entry(id: 0, time: "line(2.0)", speaker: .mine, settled: "first", pending: "")
private let last = ReadingState.Entry(id: 1, time: "line(5.0)", speaker: .theirs, settled: "last", pending: "")

private func makeWarned() -> ReadingState {

    makeState(problems: problems, banners: [
        .init(kind: .callSilent, time: "line(8.0)"), .init(kind: .diskFull(.theirs), time: "line(7.0)"),
        .init(kind: .callAudio, time: "line(6.0)"), .init(kind: .microphone, time: "line(3.0)"),
    ], rows: [.entry(first), gaps[0], .entry(last), gaps[1], gaps[2]])
}

private func makeFaulted() -> ReadingState {

    var state = makeWarned()
    state.problems.removeAll { $0.kind == .callSilent }
    state.banners.removeFirst()
    return state
}

private func update(late: Bool = false) -> ReadingTextUpdate {

    .init(status: .listening, entries: [
        .init(id: firstID, start: 2, end: 3, settled: "first", writtenLater: late),
        .init(id: lastID, start: 5, end: 6, settled: "last", writtenLater: late),
    ])
}

private func makeState(
    recording: ReadingState.Recording = .on(elapsed: "recording(9.0)"), late: Bool = false,
    problems: [ReadingProblem] = [], banners: [ReadingState.Banner] = [],
    rows: [ReadingState.Row] = [.entry(first), .entry(last)]
) -> ReadingState {

    var state = ReadingState(recording: recording, problems: problems, status: .listening,
                             nextDisplayID: 2, lines: .init(rows: .init(tail: rows)))
    for (index, entry) in update(late: late).entries.enumerated() {
        state.anchors[entry.id] = .init(id: index, start: entry.start)
        state.text[entry.id] = entry
    }
    state.banners = banners
    state.log = .lines(state.lines)
    return state
}
