import Testing
@testable import Reading

struct ReadingProblemTests {

    @Test func faultsAndWarningAreNewestFirst() { assert(base, .problemsChanged(problems), reducedTo: warned) }
    @Test func problemsHaveNoEffect() { assert(base, .problemsChanged(problems), effect: nil) }
    @Test func clearingWarningKeepsFaultsAndGaps() { assert(warned, .problemsChanged([]), reducedTo: faulted) }
    @Test func repeatedFaultKeepsItsFirstTime() { assert(faulted, .problemsChanged([.init(.microphone, began: 99)]), reducedTo: faulted) }
    @Test func recordingOffClearsProblemsAndGaps() { assert(warned, .recordingChanged(.off), reducedTo: stopped) }
    @Test func gapsSplitLateGroupsAtTheirTime() { assert(lateBase, .problemsChanged([microphone]), reducedTo: lateFaulted) }
    @Test func lateTextKeepsTheGapAtItsTime() { assert(faulted, .textUpdated(update(late: true)), reducedTo: allLateFaulted) }
    @Test func warningAloneHasNoGap() { assert(base, .problemsChanged([silent]), reducedTo: silentOnly) }
    @Test func gapsAndTextStayVisibleDuringPreparation() { #expect(preparingFaulted.log == .lines(preparingFaulted.lines)) }
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
private let base = fixture()
private let stopped = fixture(recording: .off)
private let warned = fixture(problems: [callAudio, silent, microphone, disk], banners: [
    .init(kind: .callSilent, time: "00:08"), .init(kind: .diskFull(.theirs), time: "00:07"),
    .init(kind: .callAudio, time: "00:06"), .init(kind: .microphone, time: "00:03"),
], rows: [.entry(first), gaps[0], .entry(last), gaps[1], gaps[2]])
private let faulted: ReadingState = {
    var state = warned
    state.problems.removeAll { $0.kind == .callSilent }
    state.banners.removeFirst()
    return state
}()
private let silentOnly = fixture(problems: [silent], banners: [.init(kind: .callSilent, time: "00:08")])
private let lateBase = fixture(late: true, rows: [.late(.init(span: "00:02–00:06", entries: [first, last]))])
private let lateFaulted = fixture(late: true, problems: [microphone], banners: [.init(kind: .microphone, time: "00:03")], rows: [
    .late(.init(span: "00:02–00:03", entries: [first])), gaps[0],
    .late(.init(span: "00:05–00:06", entries: [last])),
])
private let allLateFaulted: ReadingState = {
    var state = faulted
    state.text = Dictionary(uniqueKeysWithValues: update(late: true).entries.map { ($0.id, $0) })
    state.lines.rows = [
        .late(.init(span: "00:02–00:03", entries: [first])), gaps[0],
        .late(.init(span: "00:05–00:06", entries: [last])), gaps[1], gaps[2],
    ]
    return state
}()
private let preparingFaulted: ReadingState = {
    var state = faulted
    state.status = .gettingReady
    return state
}()

private func update(late: Bool = false) -> ReadingTextUpdate {
    .init(status: .listening, entries: [
        .init(id: .init(speaker: .mine, localID: 1), start: 2, end: 3, settled: "first", writtenLater: late),
        .init(id: .init(speaker: .theirs, localID: 1), start: 5, end: 6, settled: "last", writtenLater: late),
    ])
}

private func fixture(
    recording: ReadingState.Recording = .on(elapsed: "00:00:09"), late: Bool = false,
    problems: [ReadingProblem] = [], banners: [ReadingState.Banner] = [],
    rows: [ReadingState.Row] = [.entry(first), .entry(last)]
) -> ReadingState {
    var state = ReadingState()
    state.recording = recording
    state.status = .listening
    state.problems = problems
    state.banners = banners
    state.lines.rows = rows
    for (index, entry) in update(late: late).entries.enumerated() {
        state.anchors[entry.id] = .init(id: index, start: entry.start)
        state.text[entry.id] = entry
    }
    state.nextDisplayID = 2
    return state
}
