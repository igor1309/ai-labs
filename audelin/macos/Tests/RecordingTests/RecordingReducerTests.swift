import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingReducerTests {

    @Test func userStartBeginsAHandSession() { assert(idle, .userStart, reducedTo: beginning) }
    @Test func userStartAsksToBeginSessionOne() { assert(idle, .userStart, effect: .beginSession(id: 1)) }

    @Test func callStartedBeginsACallSession() { assert(idle, .callStarted, reducedTo: call) }
    @Test func callStartedAsksToBeginSessionOne() { assert(idle, .callStarted, effect: .beginSession(id: 1)) }

    @Test func userStopWhileIdleChangesNothing() { assert(idle, .userStop, reducedTo: idle) }
    @Test func userStopWhileIdleHasNoEffect() { assert(idle, .userStop, effect: nil) }

    @Test func callEndedWhileIdleChangesNothing() { assert(idle, .callEnded, reducedTo: idle) }
    @Test func callEndedWhileIdleHasNoEffect() { assert(idle, .callEnded, effect: nil) }

    @Test func automaticOffIsKept() { assert(idle, .automaticChanged(false), reducedTo: changed(idle) { $0.automatic = false }) }
    @Test func automaticOffHasNoEffect() { assert(idle, .automaticChanged(false), effect: nil) }

    @Test func readySessionStartsRecording() { assert(beginning, .sessionReported(id: 1, .ready), reducedTo: running) }
    @Test func readySessionHasNoEffect() { assert(beginning, .sessionReported(id: 1, .ready), effect: nil) }

    @Test func userStartWhileBeginningChangesNothing() { assert(beginning, .userStart, reducedTo: beginning) }
    @Test func userStartWhileBeginningHasNoEffect() { assert(beginning, .userStart, effect: nil) }

    @Test func userStartWhileRecordingChangesNothing() { assert(running, .userStart, reducedTo: running) }
    @Test func userStartWhileRecordingHasNoEffect() { assert(running, .userStart, effect: nil) }

    @Test func userStopWhileRecordingEndsTheSession() { assert(running, .userStop, reducedTo: ending) }
    @Test func userStopWhileRecordingAsksToEndSessionOne() { assert(running, .userStop, effect: .endSession(id: 1)) }

    @Test func userStopWhileBeginningEndsTheSession() { assert(beginning, .userStop, reducedTo: changed(beginning) { $0.phase = .ending }) }
    @Test func userStopWhileBeginningAsksToEndSessionOne() { assert(beginning, .userStop, effect: .endSession(id: 1)) }

    @Test func callEndedEndsTheCallSession() { assert(call, .callEnded, reducedTo: changed(ending) { $0.sessionBeganDuringCall = true; $0.session = .init(id: 1, origin: .call) }) }
    @Test func callEndedAsksToEndSessionOne() { assert(call, .callEnded, effect: .endSession(id: 1)) }

    @Test func userStopWhileEndingChangesNothing() { assert(ending, .userStop, reducedTo: ending) }
    @Test func userStopWhileEndingHasNoEffect() { assert(ending, .userStop, effect: nil) }

    @Test func readySessionWhileEndingChangesNothing() { assert(ending, .sessionReported(id: 1, .ready), reducedTo: ending) }
    @Test func readySessionWhileEndingHasNoEffect() { assert(ending, .sessionReported(id: 1, .ready), effect: nil) }

    @Test func callStartedWhileEndingIsKeptPending() { assert(ending, .callStarted, reducedTo: pending) }
    @Test func callStartedWhileEndingHasNoEffect() { assert(ending, .callStarted, effect: nil) }

    @Test func callEndedWhilePendingDropsThePendingCall() { assert(pending, .callEnded, reducedTo: ending) }
    @Test func callEndedWhilePendingHasNoEffect() { assert(pending, .callEnded, effect: nil) }

    @Test func cannotRecordWhileRecordingKeepsTheFailureAndEnds() { assert(running, .sessionReported(id: 1, .cannotRecord("cannot keep audio")), reducedTo: failed) }
    @Test func cannotRecordWhileRecordingAsksToEndSessionOne() { assert(running, .sessionReported(id: 1, .cannotRecord("cannot keep audio")), effect: .endSession(id: 1)) }

    @Test func endedFailedSessionGoesIdleKeepingTheFailure() { assert(failed, .sessionReported(id: 1, .ended), reducedTo: ended) }
    @Test func endedFailedSessionHasNoEffect() { assert(failed, .sessionReported(id: 1, .ended), effect: nil) }

    @Test func userStartAfterFailureBeginsSessionTwo() { assert(ended, .userStart, reducedTo: changed(beginning) { $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand) }) }
    @Test func userStartAfterFailureAsksToBeginSessionTwo() { assert(ended, .userStart, effect: .beginSession(id: 2)) }

    @Test func endedSessionWithPendingCallBeginsACallSessionTwo() { assert(pending, .sessionReported(id: 1, .ended), reducedTo: changed(call) { $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call) }) }
    @Test func endedSessionWithPendingCallAsksToBeginSessionTwo() { assert(pending, .sessionReported(id: 1, .ended), effect: .beginSession(id: 2)) }

    @Test func endedReportOfAnotherSessionChangesNothing() { assert(running, .sessionReported(id: 99, .ended), reducedTo: running) }
    @Test func endedReportOfAnotherSessionHasNoEffect() { assert(running, .sessionReported(id: 99, .ended), effect: nil) }

    @Test func failureOfAnotherSessionChangesNothing() { assert(running, .sessionReported(id: 99, .cannotRecord("old failure")), reducedTo: running) }
    @Test func failureOfAnotherSessionHasNoEffect() { assert(running, .sessionReported(id: 99, .cannotRecord("old failure")), effect: nil) }

    @Test func readyReportWhileIdleChangesNothing() { assert(idle, .sessionReported(id: 1, .ready), reducedTo: idle) }
    @Test func readyReportWhileIdleHasNoEffect() { assert(idle, .sessionReported(id: 1, .ready), effect: nil) }

    @Test(arguments: RecordingCondition.allCases)
    func userStartWhileBlockedChangesNothing(_ c: RecordingCondition) { assert(blocked(c), .userStart, reducedTo: blocked(c)) }
    @Test(arguments: RecordingCondition.allCases)
    func userStartWhileBlockedHasNoEffect(_ c: RecordingCondition) { assert(blocked(c), .userStart, effect: nil) }

    @Test(arguments: RecordingCondition.allCases)
    func callStartedWhileBlockedOnlyNotesTheCall(_ c: RecordingCondition) { assert(blocked(c), .callStarted, reducedTo: changed(blocked(c)) { $0.callOn = true }) }
    @Test(arguments: RecordingCondition.allCases)
    func callStartedWhileBlockedHasNoEffect(_ c: RecordingCondition) { assert(blocked(c), .callStarted, effect: nil) }

    @Test(arguments: RecordingCondition.allCases)
    func regainedConditionUnblocks(_ c: RecordingCondition) { assert(blocked(c), .conditionChanged(c, available: true), reducedTo: idle) }
    @Test(arguments: RecordingCondition.allCases)
    func regainedConditionHasNoEffect(_ c: RecordingCondition) { assert(blocked(c), .conditionChanged(c, available: true), effect: nil) }

    @Test(arguments: RecordingCondition.allCases)
    func lostConditionWhileIdleBlocks(_ c: RecordingCondition) { assert(idle, .conditionChanged(c, available: false), reducedTo: blocked(c)) }
    @Test(arguments: RecordingCondition.allCases)
    func lostConditionWhileIdleHasNoEffect(_ c: RecordingCondition) { assert(idle, .conditionChanged(c, available: false), effect: nil) }

    @Test(arguments: RecordingCondition.allCases)
    func lostConditionWhileRecordingIsKeptAndEndsOnlyWithoutStorage(_ c: RecordingCondition) {
        assert(runningSeven, .conditionChanged(c, available: false), reducedTo: changed(runningSeven) { $0.missing = [c]; if losesStorage(c) { $0.phase = .ending } })
    }
    @Test(arguments: RecordingCondition.allCases)
    func lostConditionWhileRecordingAsksToEndOnlyWithoutStorage(_ c: RecordingCondition) {
        assert(runningSeven, .conditionChanged(c, available: false), effect: losesStorage(c) ? .endSession(id: 7) : nil)
    }

    @Test func freshStateMissesEveryCondition() { #expect(RecordingState().missing == Set(RecordingCondition.allCases)) }

    @Test func userStartBeforeConditionsAreReportedChangesNothing() { assert(RecordingState(), .userStart, reducedTo: RecordingState()) }
    @Test func userStartBeforeConditionsAreReportedHasNoEffect() { assert(RecordingState(), .userStart, effect: nil) }

    @Test(arguments: sessionIDs)
    func failureOfLatestSessionWhileIdleIsKept(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id, .cannotRecord("cannot keep audio")), reducedTo: failedAfter(id)) }
    @Test(arguments: sessionIDs)
    func failureOfLatestSessionWhileIdleHasNoEffect(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id, .cannotRecord("cannot keep audio")), effect: nil) }

    @Test(arguments: sessionIDs)
    func readyOfLatestSessionWhileIdleChangesNothing(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id, .ready), reducedTo: idleAfter(id)) }
    @Test(arguments: sessionIDs)
    func readyOfLatestSessionWhileIdleHasNoEffect(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id, .ready), effect: nil) }

    @Test(arguments: sessionIDs)
    func endedOfLatestSessionWhileIdleKeepsTheFailure(_ id: UInt64) { assert(failedAfter(id), .sessionReported(id: id, .ended), reducedTo: failedAfter(id)) }
    @Test(arguments: sessionIDs)
    func endedOfLatestSessionWhileIdleHasNoEffect(_ id: UInt64) { assert(failedAfter(id), .sessionReported(id: id, .ended), effect: nil) }

    @Test(arguments: sessionIDs)
    func failureOfEarlierSessionWhileIdleChangesNothing(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id - 1, .cannotRecord("old failure")), reducedTo: idleAfter(id)) }
    @Test(arguments: sessionIDs)
    func failureOfEarlierSessionWhileIdleHasNoEffect(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id - 1, .cannotRecord("old failure")), effect: nil) }

    @Test(arguments: sessionIDs)
    func failureOfUnknownSessionWhileIdleChangesNothing(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id + 1, .cannotRecord("unknown failure")), reducedTo: idleAfter(id)) }
    @Test(arguments: sessionIDs)
    func failureOfUnknownSessionWhileIdleHasNoEffect(_ id: UInt64) { assert(idleAfter(id), .sessionReported(id: id + 1, .cannotRecord("unknown failure")), effect: nil) }

    @Test func failureBeforeAnySessionChangesNothing() { assert(RecordingState(), .sessionReported(id: 0, .cannotRecord("no Session")), reducedTo: RecordingState()) }
    @Test func failureBeforeAnySessionHasNoEffect() { assert(RecordingState(), .sessionReported(id: 0, .cannotRecord("no Session")), effect: nil) }

    @Test(arguments: conditionPairs)
    func partialRecoveryKeepsTheOtherConditionMissing(_ p: ConditionPair) { assert(blockedByTwo(p), .conditionChanged(p.recovered, available: true), reducedTo: blocked(p.remaining)) }
    @Test(arguments: conditionPairs)
    func partialRecoveryHasNoEffect(_ p: ConditionPair) { assert(blockedByTwo(p), .conditionChanged(p.recovered, available: true), effect: nil) }
}

private func changed(_ state: RecordingState, _ edit: (inout RecordingState) -> Void) -> RecordingState {

    var state = state
    edit(&state)
    return state
}

private let idle = RecordingState(automatic: true, missing: [])
private let beginning = changed(idle) {
    $0.phase = .beginning
    $0.session = .init(id: 1, origin: .hand)
    $0.lastSessionID = 1
}
private let running = changed(beginning) { $0.phase = .recording }
private let ending = changed(running) { $0.phase = .ending }
private let pending = changed(ending) { $0.callOn = true; $0.pendingCall = true }
private let call = changed(beginning) {
    $0.callOn = true
    $0.sessionBeganDuringCall = true
    $0.session = .init(id: 1, origin: .call)
}
private let failed = changed(ending) { $0.cannotRecord = "cannot keep audio" }
private let ended = changed(idle) { $0.lastSessionID = 1; $0.cannotRecord = "cannot keep audio" }

private func blocked(_ condition: RecordingCondition) -> RecordingState { changed(idle) { $0.missing = [condition] } }
private func losesStorage(_ condition: RecordingCondition) -> Bool { condition == .callsFolder || condition == .room }
private let runningSeven = changed(idle) {
    $0.phase = .recording
    $0.session = .init(id: 7, origin: .hand)
    $0.lastSessionID = 7
}

private let sessionIDs: [UInt64] = [1, 7]
private func idleAfter(_ id: UInt64) -> RecordingState { changed(RecordingState(missing: [])) { $0.lastSessionID = id } }
private func failedAfter(_ id: UInt64) -> RecordingState { changed(idleAfter(id)) { $0.cannotRecord = "cannot keep audio" } }

struct ConditionPair: Sendable, CustomTestStringConvertible {
    let recovered: RecordingCondition
    let remaining: RecordingCondition
    var testDescription: String { "\(recovered) recovered, \(remaining) remaining" }
}
private let conditionPairs = RecordingCondition.allCases.flatMap { recovered in
    RecordingCondition.allCases.filter { $0 != recovered }.map { ConditionPair(recovered: recovered, remaining: $0) }
}
private func blockedByTwo(_ p: ConditionPair) -> RecordingState { changed(idle) { $0.missing = [p.recovered, p.remaining] } }
