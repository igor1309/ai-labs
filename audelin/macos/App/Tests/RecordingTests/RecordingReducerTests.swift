import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingReducerTests {

    @Test(arguments: faultTransitions)
    func faultsFollowTheCurrentSession(_ c: FaultTransition) {
        if let mutation = c.mutation {
            assert(c.state, c.event, mutation: mutation)
        } else {
            assert(c.state, c.event)
        }
    }

    @Test(arguments: [RecordingState.Phase.beginning, .recording, .ending], [false, true])
    func callSilenceFollowsTheCurrentSession(_ phase: RecordingState.Phase, _ value: Bool) { assert(makeState(makeRunning()) { $0.phase = phase; $0.callSilent = !value; $0.faults = [.microphone] }, .sessionReported(id: 1, .callSilent(value))) { $0.callSilent = value } }

    @Test func endingTheSessionClearsCallSilence() { assert(makeState(makeEnding()) { $0.callSilent = true }, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.session = nil; $0.callSilent = false } }

    @Test func aNewBeginClearsCallSilence() { assert(makeState(makeIdle()) { $0.callSilent = true }, .userStart) { $0.phase = .beginning; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1; $0.callSilent = false } }

    @Test(arguments: [false, true])
    func staleCallSilenceAfterEndIsIgnored(_ value: Bool) { assert(makeIdleAfter(1), .sessionReported(id: 1, .callSilent(value))) }

    @Test func callSilenceWhileIdleIsIgnored() { assert(makeState(makeIdleAfter(1)) { $0.session = .init(id: 1, origin: .hand) }, .sessionReported(id: 1, .callSilent(true))) }

    @Test func anotherSessionsCallSilenceIsIgnored() { assert(makeRunning(), .sessionReported(id: 99, .callSilent(true))) }

    @Test func endingKeepsCallSilence() { assert(makeState(makeRunning()) { $0.callSilent = true }, .userStop) { $0.phase = .ending } }

    @Test func userStartBeginsAHandSession() { assert(makeIdle(), .userStart) { $0.phase = .beginning; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 } }

    @Test func callStartedBeginsACallSession() { assert(makeIdle(), .callStarted) { $0.phase = .beginning; $0.session = .init(id: 1, origin: .call); $0.lastSessionID = 1; $0.callOn = true; $0.sessionBeganDuringCall = true } }

    @Test func userStopWhileIdleChangesNothing() { assert(makeIdle(), .userStop) }

    @Test func callEndedWhileIdleChangesNothing() { assert(makeIdle(), .callEnded) }

    @Test func automaticOffIsKept() { assert(makeIdle(), .automaticChanged(false)) { $0.automatic = false } }

    @Test func readySessionStartsRecording() { assert(makeBeginning(), .sessionReported(id: 1, .ready)) { $0.phase = .recording } }

    @Test func userStartWhileBeginningChangesNothing() { assert(makeBeginning(), .userStart) }

    @Test func userStartWhileRecordingChangesNothing() { assert(makeRunning(), .userStart) }

    @Test func userStopWhileRecordingEndsTheSession() { assert(makeRunning(), .userStop) { $0.phase = .ending } }

    @Test func userStopWhileBeginningEndsTheSession() { assert(makeBeginning(), .userStop) { $0.phase = .ending } }

    @Test func callEndedEndsTheCallSession() { assert(makeCall(), .callEnded) { $0.phase = .ending; $0.callOn = false } }

    @Test func userStopWhileEndingChangesNothing() { assert(makeEnding(), .userStop) }

    @Test func readySessionWhileEndingChangesNothing() { assert(makeEnding(), .sessionReported(id: 1, .ready)) }

    @Test func callStartedWhileEndingIsKeptPending() { assert(makeEnding(), .callStarted) { $0.callOn = true; $0.pendingCall = true } }

    @Test func callEndedWhilePendingDropsThePendingCall() { assert(makePending(), .callEnded) { $0.callOn = false; $0.pendingCall = false } }

    @Test func cannotRecordWhileRecordingKeepsTheFailureAndEnds() { assert(makeRunning(), .sessionReported(id: 1, .cannotRecord("cannot keep audio"))) { $0.phase = .ending; $0.cannotRecord = "cannot keep audio" } }

    @Test func endedFailedSessionGoesIdleKeepingTheFailure() { assert(makeFailed(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.session = nil } }

    @Test func userStartAfterFailureBeginsSessionTwo() { assert(makeEnded(), .userStart) { $0.phase = .beginning; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand); $0.cannotRecord = nil } }

    @Test func endedSessionWithPendingCallBeginsACallSessionTwo() { assert(makePending(), .sessionReported(id: 1, .ended)) { $0.phase = .beginning; $0.pendingCall = false; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true } }

    @Test func endedReportOfAnotherSessionChangesNothing() { assert(makeRunning(), .sessionReported(id: 99, .ended)) }

    @Test func failureOfAnotherSessionChangesNothing() { assert(makeRunning(), .sessionReported(id: 99, .cannotRecord("old failure"))) }

    @Test func readyReportWhileIdleChangesNothing() { assert(makeIdle(), .sessionReported(id: 1, .ready)) }

    @Test(arguments: RecordingCondition.allCases.filter { $0 != .callAudioAccess })
    func userStartWhileBlockedChangesNothing(_ c: RecordingCondition) { assert(makeBlocked(c), .userStart) }

    @Test(arguments: RecordingCondition.allCases.filter { $0 != .callAudioAccess })
    func callStartedWhileBlockedOnlyNotesTheCall(_ c: RecordingCondition) { assert(makeBlocked(c), .callStarted) { $0.callOn = true } }

    @Test(arguments: RecordingCondition.allCases)
    func regainedConditionUnblocks(_ c: RecordingCondition) { assert(makeBlocked(c), .conditionChanged(c, available: true)) { $0.missing = [] } }

    @Test(arguments: RecordingCondition.allCases)
    func lostConditionWhileIdleBlocks(_ c: RecordingCondition) { assert(makeIdle(), .conditionChanged(c, available: false)) { $0.missing = [c] } }

    @Test(arguments: RecordingCondition.allCases)
    func lostConditionWhileRecordingIsKeptAndEndsOnlyWithoutStorage(_ c: RecordingCondition) {
        assert(makeRunning(id: 7), .conditionChanged(c, available: false)) { $0.missing = [c]; if losesStorage(c) { $0.phase = .ending } }
    }

    // A prior call-audio reading cannot prevent the doer from refreshing readiness.
    @Test func missingCallAudioIsRecheckedBeforeSessionBegins() {
        assert(makeBlocked(.callAudioAccess), .userStart) { $0.phase = .beginning; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 }
        assert(makeBlocked(.callAudioAccess), .callStarted) { $0.phase = .beginning; $0.session = .init(id: 1, origin: .call); $0.lastSessionID = 1; $0.callOn = true; $0.sessionBeganDuringCall = true }
    }

    @Test func freshStateMissesEveryCondition() { #expect(RecordingState().missing == Set(RecordingCondition.allCases)) }

    @Test func userStartBeforeConditionsAreReportedChangesNothing() { assert(makeUnknown(), .userStart) }

    @Test(arguments: sessionIDs)
    func failureOfLatestSessionWhileIdleIsKept(_ id: UInt64) { assert(makeIdleAfter(id), .sessionReported(id: id, .cannotRecord("cannot keep audio"))) { $0.cannotRecord = "cannot keep audio" } }

    @Test(arguments: sessionIDs)
    func readyOfLatestSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), .sessionReported(id: id, .ready)) }

    @Test(arguments: sessionIDs)
    func endedOfLatestSessionWhileIdleKeepsTheFailure(_ id: UInt64) { assert(makeFailedAfter(id), .sessionReported(id: id, .ended)) }

    @Test(arguments: sessionIDs)
    func failureOfEarlierSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), .sessionReported(id: id - 1, .cannotRecord("old failure"))) }

    @Test(arguments: sessionIDs)
    func failureOfUnknownSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), .sessionReported(id: id + 1, .cannotRecord("unknown failure"))) }

    @Test func failureBeforeAnySessionChangesNothing() { assert(makeUnknown(), .sessionReported(id: 0, .cannotRecord("no Session"))) }

    @Test(arguments: conditionPairs)
    func partialRecoveryKeepsTheOtherConditionMissing(_ p: ConditionPair) { assert(makeBlockedByTwo(p), .conditionChanged(p.recovered, available: true)) { $0.missing.remove(p.recovered) } }
}

private func makeState(_ state: RecordingState, _ configure: (inout RecordingState) -> Void) -> RecordingState {
    var state = state
    configure(&state)
    return state
}

private func makeUnknown() -> RecordingState { RecordingState() }
private func makeIdle() -> RecordingState { RecordingState(automatic: true, missing: []) }
private func makeBeginning(id: UInt64 = 1) -> RecordingState {
    makeState(makeIdle()) {
        $0.phase = .beginning
        $0.session = .init(id: id, origin: .hand)
        $0.lastSessionID = id
    }
}
private func makeRunning(id: UInt64 = 1) -> RecordingState { makeState(makeBeginning(id: id)) { $0.phase = .recording } }
private func makeEnding() -> RecordingState { makeState(makeRunning()) { $0.phase = .ending } }
private func makePending() -> RecordingState { makeState(makeEnding()) { $0.callOn = true; $0.pendingCall = true } }
private func makeCall() -> RecordingState {
    makeState(makeBeginning()) {
        $0.callOn = true
        $0.sessionBeganDuringCall = true
        $0.session = .init(id: 1, origin: .call)
    }
}
private func makeFailed() -> RecordingState { makeState(makeEnding()) { $0.cannotRecord = "cannot keep audio" } }
private func makeEnded() -> RecordingState { makeState(makeIdle()) { $0.lastSessionID = 1; $0.cannotRecord = "cannot keep audio" } }
private func makeBlocked(_ condition: RecordingCondition) -> RecordingState { makeState(makeIdle()) { $0.missing = [condition] } }
private func losesStorage(_ condition: RecordingCondition) -> Bool { condition == .callsFolder || condition == .room }
private let sessionIDs: [UInt64] = [1, 7]
private func makeIdleAfter(_ id: UInt64) -> RecordingState { makeState(RecordingState(missing: [])) { $0.lastSessionID = id } }
private func makeFailedAfter(_ id: UInt64) -> RecordingState { makeState(makeIdleAfter(id)) { $0.cannotRecord = "cannot keep audio" } }

struct ConditionPair: Sendable, CustomTestStringConvertible {
    let recovered: RecordingCondition
    let remaining: RecordingCondition
    var testDescription: String { "\(recovered) recovered, \(remaining) remaining" }
}
private let conditionPairs = RecordingCondition.allCases.flatMap { recovered in
    RecordingCondition.allCases.filter { $0 != recovered }.map { ConditionPair(recovered: recovered, remaining: $0) }
}
private func makeBlockedByTwo(_ p: ConditionPair) -> RecordingState { makeState(makeIdle()) { $0.missing = [p.recovered, p.remaining] } }

struct FaultTransition: Sendable, CustomTestStringConvertible {
    let state: RecordingState
    let event: RecordingEvent
    let mutation: (@Sendable (inout RecordingState) -> Void)?
    var testDescription: String { "\(state.phase) + \(event)" }

    init(state: RecordingState, event: RecordingEvent, mutation: (@Sendable (inout RecordingState) -> Void)? = nil) {
        self.state = state
        self.event = event
        self.mutation = mutation
    }
}

private let faultTransitions: [FaultTransition] = RecordingFault.allCases.flatMap { fault -> [FaultTransition] in
    let faulted = makeState(makeRunning()) { $0.faults = [fault] }
    let faultedIdle = makeState(makeIdleAfter(1)) { $0.automatic = true; $0.faults = [fault] }
    let addDiskFull: (@Sendable (inout RecordingState) -> Void)?
    if fault == .diskFull { addDiskFull = nil }
    else { addDiskFull = { $0.faults.insert(.diskFull) } }
    return [makeBeginning(), makeRunning(), makeEnding()].flatMap { state -> [FaultTransition] in
        [FaultTransition(state: state, event: .sessionReported(id: 1, .failed(fault))) { $0.faults = [fault] },
         FaultTransition(state: state, event: .sessionReported(id: 99, .failed(fault)))]
    } + [
        FaultTransition(state: faulted, event: .sessionReported(id: 1, .failed(fault))),
        FaultTransition(state: faulted, event: .sessionReported(id: 1, .failed(.diskFull)), mutation: addDiskFull),
        FaultTransition(state: faulted, event: .userStop) { $0.phase = .ending },
        FaultTransition(state: faulted, event: .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.session = nil },
        FaultTransition(state: faultedIdle, event: .sessionReported(id: 1, .failed(.diskFull))),
        FaultTransition(state: makeState(faultedIdle) { $0.session = .init(id: 1, origin: .hand) }, event: .sessionReported(id: 1, .failed(.diskFull))),
        FaultTransition(state: faultedIdle, event: .userStart) { $0.phase = .beginning; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand); $0.faults = [] },
        FaultTransition(state: makeState(makePending()) { $0.faults = [fault] }, event: .sessionReported(id: 1, .ended)) { $0.phase = .beginning; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true; $0.pendingCall = false; $0.faults = [] },
        FaultTransition(state: makeState(faultedIdle) { $0.missing = [.room] }, event: .userStart),
    ]
}
