import Testing
import Reading

struct ReadingProblemTests {

    @Test func faultsAndWarningAreNewestFirst() {

        assert(makeState(), .problemsChanged(problems), delivers: nil) {
            $0.problems = problems
            $0.banners = [
                .init(kind: .callSilent, time: "00:08"), .init(kind: .diskFull(.theirs), time: "00:07"),
                .init(kind: .callAudio, time: "00:06"), .init(kind: .microphone, time: "00:03"),
            ]
            $0.lines.rows = [.entry(first), gaps[0], .entry(last), gaps[1], gaps[2]]
            $0.log = .lines($0.lines)
        }
    }

    @Test func clearingWarningKeepsFaultsAndGaps() {

        assert(makeWarned(), .problemsChanged([]), delivers: nil) {
            $0.problems.removeAll { $0.kind == .callSilent }
            $0.banners.removeFirst()
        }
    }

    @Test func repeatedFaultKeepsItsFirstTime() {

        assert(makeFaulted(), .problemsChanged([.init(.microphone, began: 99)]), delivers: nil)
    }

    @Test func recordingOffClearsProblemsAndGaps() {

        assert(makeWarned(), .recordingChanged(.off), delivers: nil) {
            $0.recording = .off
            $0.problems = []
            $0.banners = []
            $0.lines.rows = [.entry(first), .entry(last)]
            $0.log = .lines($0.lines)
        }
    }

    @Test func gapsSplitLateGroupsAtTheirTime() {

        assert(makeState(late: true, rows: [.late(.init(span: "00:02–00:06", entries: [first, last]))]),
               .problemsChanged([microphone]), delivers: nil) {
            $0.problems = [microphone]
            $0.banners = [.init(kind: .microphone, time: "00:03")]
            $0.lines.rows = [
                .late(.init(span: "00:02–00:03", entries: [first])), gaps[0],
                .late(.init(span: "00:05–00:06", entries: [last])),
            ]
            $0.log = .lines($0.lines)
        }
    }

    @Test func lateTextKeepsTheGapAtItsTime() {

        assert(makeFaulted(), .textUpdated(update(late: true)), delivers: nil) {
            for entry in update(late: true).entries { $0.text[entry.id] = entry }
            $0.lines.rows = [
                .late(.init(span: "00:02–00:03", entries: [first])), gaps[0],
                .late(.init(span: "00:05–00:06", entries: [last])), gaps[1], gaps[2],
            ]
            $0.log = .lines($0.lines)
        }
    }

    @Test func warningAloneHasNoGap() {

        assert(makeState(), .problemsChanged([silent]), delivers: nil) {
            $0.problems = [silent]
            $0.banners = [.init(kind: .callSilent, time: "00:08")]
        }
    }

    @Test func gapsAndTextStayVisibleDuringPreparation() {

        assert(makeFaulted(), .textUpdated(.init(status: .gettingReady, entries: [])), delivers: nil) {
            $0.status = .gettingReady
        }
    }

    @Test func equalProblemTimesPutTheNewestBannerFirst() {

        let existing = ReadingProblem(.callAudio, began: 3)
        let new = ReadingProblem(.diskFull(.mine), began: 3)
        assert(makeState(problems: [existing], banners: [.init(kind: .callAudio, time: "00:03")],
                         rows: [.entry(first), .gap(.init(speaker: .theirs, time: "00:03", kind: .callAudio)), .entry(last)]),
               .problemsChanged([existing, new]), delivers: nil) {
            $0.problems.append(new)
            $0.banners.insert(.init(kind: .diskFull(.mine), time: "00:03"), at: 0)
            $0.lines.rows.insert(.gap(.init(speaker: .mine, time: "00:03", kind: .diskFull(.mine))), at: 2)
            $0.log = .lines($0.lines)
        }
    }
}

private let microphone = ReadingProblem(.microphone, began: 3)
private let callAudio = ReadingProblem(.callAudio, began: 6)
private let disk = ReadingProblem(.diskFull(.theirs), began: 7)
private let silent = ReadingProblem(.callSilent, began: 8)
private let problems = [callAudio, silent, microphone, disk]
private let gaps: [ReadingState.Row] = [
    .gap(.init(speaker: .mine, time: "00:03", kind: .microphone)),
    .gap(.init(speaker: .theirs, time: "00:06", kind: .callAudio)),
    .gap(.init(speaker: .theirs, time: "00:07", kind: .diskFull(.theirs))),
]
private let first = ReadingState.Entry(id: 0, time: "00:02", speaker: .mine, settled: "first", pending: "")
private let last = ReadingState.Entry(id: 1, time: "00:05", speaker: .theirs, settled: "last", pending: "")

private func makeWarned() -> ReadingState {

    makeState(problems: problems, banners: [
        .init(kind: .callSilent, time: "00:08"), .init(kind: .diskFull(.theirs), time: "00:07"),
        .init(kind: .callAudio, time: "00:06"), .init(kind: .microphone, time: "00:03"),
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
        .init(id: .init(speaker: .mine, localID: 1), start: 2, end: 3, settled: "first", writtenLater: late),
        .init(id: .init(speaker: .theirs, localID: 1), start: 5, end: 6, settled: "last", writtenLater: late),
    ])
}

private func makeState(
    recording: ReadingState.Recording = .on(elapsed: "00:00:09"), late: Bool = false,
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
