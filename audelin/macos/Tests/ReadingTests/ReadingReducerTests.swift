@testable import Reading
import Testing

struct ReadingReducerTests {

    @Test func recordingOnShowsElapsedTime() { assert(.init(), .recordingChanged(.on(elapsed: 3_661.9)), reducedTo: recording(.on(elapsed: "01:01:01"))) }
    @Test func recordingOnHasNoEffect() { assert(.init(), .recordingChanged(.on(elapsed: 3_661.9)), effect: nil) }

    @Test func recordingOffClearsElapsedTime() { assert(recording(.on(elapsed: "00:00:12")), .recordingChanged(.off), reducedTo: .init()) }
    @Test func recordingOffHasNoEffect() { assert(recording(.on(elapsed: "00:00:12")), .recordingChanged(.off), effect: nil) }

    @Test func listeningTextBecomesARow() { assert(.init(), .textUpdated(listening(entry)), reducedTo: read(entry)) }
    @Test func listeningTextHasNoEffect() { assert(.init(), .textUpdated(listening(entry)), effect: nil) }

    @Test func holdAddsAHold() { assert(.init(), .hold(held), reducedTo: lines { $0.holds = [held] }) }
    @Test func holdHasNoEffect() { assert(.init(), .hold(held), effect: nil) }

    @Test func letGoRemovesTheHold() { assert(lines { $0.holds = [held] }, .letGo(held), reducedTo: .init()) }
    @Test func letGoHasNoEffect() { assert(lines { $0.holds = [held] }, .letGo(held), effect: nil) }

    @Test func scrollingUpStopsFollowing() { assert(.init(), .scrolled(atBottom: false), reducedTo: lines { $0.followsLive = false }) }
    @Test func scrollingUpHasNoEffect() { assert(.init(), .scrolled(atBottom: false), effect: nil) }

    @Test func scrollingToBottomFollowsAndClearsNew() { assert(behind, .scrolled(atBottom: true), reducedTo: .init()) }
    @Test func scrollingToBottomHasNoEffect() { assert(behind, .scrolled(atBottom: true), effect: nil) }

    @Test func jumpToLiveFollowsAndClearsNew() { assert(behind, .jumpToLive, reducedTo: .init()) }
    @Test func jumpToLiveHasNoEffect() { assert(behind, .jumpToLive, effect: nil) }
}

private let entry = ReadingTextUpdate.Entry(id: .init(speaker: .mine, localID: 1), start: 2, end: 3, settled: "words")
private let held = ReadingState.Held(entryID: 0, text: "words")
private let behind = lines { $0.followsLive = false; $0.newBelow = 2 }

private func listening(_ entries: ReadingTextUpdate.Entry...) -> ReadingTextUpdate { .init(status: .listening, entries: entries) }

private func recording(_ recording: ReadingState.Recording) -> ReadingState {

    var state = ReadingState()
    state.recording = recording
    return state
}

private func lines(_ change: (inout ReadingState.Lines) -> Void) -> ReadingState {

    var state = ReadingState()
    change(&state.lines)
    return state
}

private func read(_ entry: ReadingTextUpdate.Entry) -> ReadingState {

    var state = ReadingState()
    state.status = .listening
    state.anchors = [entry.id: .init(id: 0, start: entry.start)]
    state.nextDisplayID = 1
    state.text = [entry.id: entry]
    state.lines.rows = [.entry(.init(id: 0, time: "00:02", speaker: .mine, settled: "words", pending: ""))]
    return state
}

func assert(
    _ state: ReadingState, _ event: ReadingEvent, reducedTo expected: ReadingState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(ReadingReducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

func assert(
    _ state: ReadingState, _ event: ReadingEvent, effect expected: Never?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(ReadingReducer.reduce(state, event).1 == expected, sourceLocation: sourceLocation)
}
