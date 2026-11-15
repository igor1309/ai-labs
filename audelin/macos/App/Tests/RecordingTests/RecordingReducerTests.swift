import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingReducerTests {

    @Test(arguments: faultTransitions)
    func faultsFollowTheCurrentSession(_ c: FaultTransition) {
        let mutation = c.mutation ?? { _ in }
        switch c.change {
        case let .event(event): assert(c.state, event, mutation: mutation)
        case let .report(status, id): assert(c.state, reporting: status, id: id, mutation: mutation)
        }
    }

    @Test(arguments: [RecordingState.Phase.recording, .ending], [false, true])
    func callSilenceFollowsTheCurrentSession(_ phase: RecordingState.Phase, _ value: Bool) { assert(makeState(makeRunning()) { $0.phase = phase; $0.callSilent = !value; $0.faults = [.microphone] }, reporting: .init(callSilent: value), id: 1) { $0.callSilent = value } }

    @Test func callSilenceBeforeTheSessionRecordsIsIgnored() { assert(makeStarting(), reporting: .init(callSilent: true), id: 1) }

    @Test func aRecordingSessionMovesBeginningToRecording() { assert(makeStarting(), reporting: .init(recording: true, faults: [.microphone], callSilent: true), id: 1) { $0.phase = .recording; $0.faults = [.microphone]; $0.callSilent = true } }

    @Test func cannotRecordEndsTheSession() { assert(makeRunning(), reporting: .init(recording: true, cannotRecord: "no track can record", faults: [.microphone]), id: 1) { $0.cannotRecord = "no track can record"; $0.phase = .ending } }

    @Test func cannotRecordCountsOnce() { assert(makeFailed(), reporting: .init(cannotRecord: "another reason"), id: 1) }

    @Test func theSessionsCreatedCallIsKept() { assert(makeRunning(), reporting: .init(callID: "A"), id: 1) { $0.callID = "A" } }

    @Test func aStatusWithoutACallKeepsTheCreatedCall() { assert(makeState(makeRunning()) { $0.callID = "A" }, reporting: .init(), id: 1) }

    @Test func anotherSessionsCreatedCallIsIgnored() { assert(makeRunning(), reporting: .init(callID: "A"), id: 99) }

    @Test func aCreatedCallAfterEndIsIgnored() { assert(makeIdleAfter(1), reporting: .init(callID: "A"), id: 1) }

    @Test func endingTheSessionClearsCallSilence() { assert(makeState(makeEnding()) { $0.callSilent = true }, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil; $0.callSilent = false } }

    @Test func aNewBeginClearsCallSilence() { assert(makeState(makeIdle()) { $0.callSilent = true }, .userStart) { $0.phase = .beginning; $0.stage = .preparing; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1; $0.callSilent = false } }

    @Test(arguments: [false, true])
    func staleCallSilenceAfterEndIsIgnored(_ value: Bool) { assert(makeIdleAfter(1), reporting: .init(callSilent: value), id: 1) }

    @Test func callSilenceWhileIdleIsIgnored() { assert(makeState(makeIdleAfter(1)) { $0.session = .init(id: 1, origin: .hand) }, reporting: .init(callSilent: true), id: 1) }

    @Test func anotherSessionsCallSilenceIsIgnored() { assert(makeRunning(), reporting: .init(callSilent: true), id: 99) }

    @Test func endingKeepsCallSilence() { assert(makeState(makeRunning()) { $0.callSilent = true; $0.pieces?.audioWarning = .callSilent }, .userStop) { $0.phase = .ending; endPieces(&$0) } }

    @Test func userStartBeginsAHandSession() { assert(makeIdle(), .userStart) { $0.phase = .beginning; $0.stage = .preparing; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 } }

    @Test func callStartedBeginsACallSession() { assert(makeIdle(), .callStarted) { $0.phase = .beginning; $0.stage = .preparing; $0.session = .init(id: 1, origin: .call); $0.lastSessionID = 1; $0.callOn = true; $0.sessionBeganDuringCall = true } }

    @Test func userStopWhileIdleChangesNothing() { assert(makeIdle(), .userStop) }

    @Test func callEndedWhileIdleChangesNothing() { assert(makeIdle(), .callEnded) }

    @Test func automaticOffIsKept() { assert(makeIdle(), .automaticChanged(false)) { $0.automatic = false } }

    @Test func readySessionStartsRecording() { assert(makeStarting(), reporting: .init(recording: true), id: 1) { $0.phase = .recording } }

    @Test func userStartWhileBeginningChangesNothing() { assert(makeBeginning(), .userStart) }

    @Test func userStartWhileRecordingChangesNothing() { assert(makeRunning(), .userStart) }

    @Test func userStopWhileRecordingEndsTheSession() { assert(makeRunning(), .userStop) { $0.phase = .ending; endPieces(&$0) } }

    @Test func userStopWhileBeginningEndsTheSession() { assert(makeBeginning(), .userStop) { $0.phase = .ending } }

    @Test func callEndedEndsTheCallSession() { assert(makeCall(), .callEnded) { $0.phase = .ending; $0.callOn = false } }

    @Test func userStopWhileEndingChangesNothing() { assert(makeEnding(), .userStop) }

    @Test func readySessionWhileEndingChangesNothing() { assert(makeEnding(), reporting: .init(recording: true), id: 1) }

    @Test func callStartedWhileEndingIsKeptPending() { assert(makeEnding(), .callStarted) { $0.callOn = true; $0.pendingCall = true } }

    @Test func callEndedWhilePendingDropsThePendingCall() { assert(makePending(), .callEnded) { $0.callOn = false; $0.pendingCall = false } }

    @Test func cannotRecordWhileRecordingKeepsTheFailureAndEnds() { assert(makeRunning(), reporting: .init(cannotRecord: "cannot keep audio"), id: 1) { $0.phase = .ending; $0.cannotRecord = "cannot keep audio" } }

    @Test func cannotRecordWhileBeginningKeepsTheFailureAndEnds() { assert(makeStarting(), reporting: .init(cannotRecord: "cannot keep audio"), id: 1) { $0.phase = .ending; $0.cannotRecord = "cannot keep audio" } }

    @Test func endedFailedSessionGoesIdleKeepingTheFailure() { assert(makeFailed(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil } }

    @Test func userStartAfterFailureBeginsSessionTwo() { assert(makeEnded(), .userStart) { $0.phase = .beginning; $0.stage = .preparing; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand); $0.cannotRecord = nil } }

    @Test func endedSessionWithPendingCallBeginsACallSessionTwo() { assert(makePending(), .sessionReported(id: 1, .ended)) { $0.phase = .beginning; $0.stage = .preparing; $0.pendingCall = false; $0.lastSessionID = 2; $0.pieces = nil; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true } }

    @Test func endedReportOfAnotherSessionChangesNothing() { assert(makeRunning(), .sessionReported(id: 99, .ended)) }

    @Test func failureOfAnotherSessionChangesNothing() { assert(makeRunning(), reporting: .init(cannotRecord: "old failure"), id: 99) }

    @Test func readyReportWhileIdleChangesNothing() { assert(makeIdle(), reporting: .init(recording: true), id: 1) }

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
        assert(makeRunning(id: 7), .conditionChanged(c, available: false)) { $0.missing = [c]; if losesStorage(c) { $0.phase = .ending; endPieces(&$0) } }
    }

    // A prior call-audio reading cannot prevent the doer from refreshing readiness.
    @Test func missingCallAudioIsRecheckedBeforeSessionBegins() {
        assert(makeBlocked(.callAudioAccess), .userStart) { $0.phase = .beginning; $0.stage = .preparing; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 }
        assert(makeBlocked(.callAudioAccess), .callStarted) { $0.phase = .beginning; $0.stage = .preparing; $0.session = .init(id: 1, origin: .call); $0.lastSessionID = 1; $0.callOn = true; $0.sessionBeganDuringCall = true }
    }

    @Test(arguments: [makeBeginning(), makeCall()])
    func callAudioReportedMissingWhileBeginningKeepsBeginning(_ beginning: RecordingState) {
        assert(beginning, .conditionChanged(.callAudioAccess, available: false)) { $0.missing = [.callAudioAccess] }
    }

    @Test(arguments: [makeBeginning(), makeCall()])
    func endedBeginningWithoutCallAudioGoesIdleStillMissingIt(_ beginning: RecordingState) {
        assert(makeState(beginning) { $0.missing = [.callAudioAccess] }, .sessionReported(id: 1, .ended)) {
            $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil; $0.sessionBeganDuringCall = false
        }
    }

    @Test func freshStateMissesEveryCondition() { #expect(RecordingState().missing == Set(RecordingCondition.allCases)) }

    @Test func userStartBeforeConditionsAreReportedChangesNothing() { assert(makeUnknown(), .userStart) }

    @Test(arguments: sessionIDs)
    func failureOfLatestSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), reporting: .init(cannotRecord: "cannot keep audio"), id: id) }

    @Test(arguments: sessionIDs)
    func readyOfLatestSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), reporting: .init(recording: true), id: id) }

    @Test(arguments: sessionIDs)
    func endedOfLatestSessionWhileIdleKeepsTheFailure(_ id: UInt64) { assert(makeFailedAfter(id), .sessionReported(id: id, .ended)) }

    @Test(arguments: sessionIDs)
    func failureOfEarlierSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), reporting: .init(cannotRecord: "old failure"), id: id - 1) }

    @Test(arguments: sessionIDs)
    func failureOfUnknownSessionWhileIdleChangesNothing(_ id: UInt64) { assert(makeIdleAfter(id), reporting: .init(cannotRecord: "unknown failure"), id: id + 1) }

    @Test func failureBeforeAnySessionChangesNothing() { assert(makeUnknown(), reporting: .init(cannotRecord: "no Session"), id: 0) }

    @Test(arguments: conditionPairs)
    func partialRecoveryKeepsTheOtherConditionMissing(_ p: ConditionPair) { assert(makeBlockedByTwo(p), .conditionChanged(p.recovered, available: true)) { $0.missing.remove(p.recovered) } }
}

private func losesStorage(_ condition: RecordingCondition) -> Bool { condition == .callsFolder || condition == .room }
private let sessionIDs: [UInt64] = [1, 7]

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
    enum Change: Sendable { case event(RecordingEvent), report(RecordingSessionStatus, id: UInt64) }
    let state: RecordingState
    let change: Change
    let mutation: (@Sendable (inout RecordingState) -> Void)?
    var testDescription: String { "\(state.phase) + \(change)" }

    init(state: RecordingState, event: RecordingEvent, mutation: (@Sendable (inout RecordingState) -> Void)? = nil) {
        self.state = state
        self.change = .event(event)
        self.mutation = mutation
    }

    init(state: RecordingState, report: RecordingSessionStatus, id: UInt64 = 1, mutation: (@Sendable (inout RecordingState) -> Void)? = nil) {
        self.state = state
        self.change = .report(report, id: id)
        self.mutation = mutation
    }
}

private let faultTransitions: [FaultTransition] = RecordingFault.allCases.flatMap { fault -> [FaultTransition] in
    let faulted = makeState(makeRunning()) { $0.faults = [fault] }
    let faultedIdle = makeState(makeIdleAfter(1)) { $0.automatic = true; $0.faults = [fault] }
    let addDiskFull: (@Sendable (inout RecordingState) -> Void)?
    if fault == .diskFull { addDiskFull = nil }
    else { addDiskFull = { $0.faults.insert(.diskFull) } }
    return [makeRunning(), makeEnding()].flatMap { state -> [FaultTransition] in
        [FaultTransition(state: state, report: .init(faults: [fault])) { $0.faults = [fault] },
         FaultTransition(state: state, report: .init(faults: [fault]), id: 99)]
    } + [
        FaultTransition(state: makeStarting(), report: .init(faults: [fault])),
        FaultTransition(state: faulted, report: .init(faults: [fault])),
        FaultTransition(state: faulted, report: .init()),
        FaultTransition(state: faulted, report: .init(faults: [.diskFull]), mutation: addDiskFull),
        FaultTransition(state: faulted, event: .userStop) { $0.phase = .ending; endPieces(&$0) },
        FaultTransition(state: faulted, event: .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil },
        FaultTransition(state: makeState(makeEnding()) { $0.faults = [fault, .diskFull] }, event: .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil },
        FaultTransition(state: faultedIdle, report: .init(faults: [.diskFull])),
        FaultTransition(state: makeState(faultedIdle) { $0.session = .init(id: 1, origin: .hand) }, report: .init(faults: [.diskFull])),
        FaultTransition(state: faultedIdle, event: .userStart) { $0.phase = .beginning; $0.stage = .preparing; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand); $0.faults = [] },
        FaultTransition(state: makeState(makePending()) { $0.faults = [fault] }, event: .sessionReported(id: 1, .ended)) { $0.phase = .beginning; $0.stage = .preparing; $0.lastSessionID = 2; $0.pieces = nil; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true; $0.pendingCall = false; $0.faults = [] },
        FaultTransition(state: makeState(faultedIdle) { $0.missing = [.room] }, event: .userStart),
    ]
}
