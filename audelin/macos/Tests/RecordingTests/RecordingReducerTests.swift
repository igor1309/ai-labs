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
    func reducerConditions(_ condition: RecordingCondition) {

        let idle = RecordingState(automatic: true, missing: [])
        let blocked = changed(idle) { $0.missing = [condition] }
        let running = changed(idle) {
            $0.phase = .recording
            $0.session = .init(id: 7, origin: .hand)
            $0.lastSessionID = 7
        }
        let losesStorage = condition == .callsFolder || condition == .room
        let cases: [(RecordingState, RecordingEvent, RecordingState, RecordingEffect?)] = [
            (blocked, .userStart, blocked, nil),
            (blocked, .callStarted, changed(blocked) { $0.callOn = true }, nil),
            (blocked, .conditionChanged(condition, available: true), idle, nil),
            (idle, .conditionChanged(condition, available: false), blocked, nil),
            (running, .conditionChanged(condition, available: false), changed(running) {
                $0.missing = [condition]
                if losesStorage { $0.phase = .ending }
            }, losesStorage ? .endSession(id: 7) : nil),
        ]
        for (state, event, expectedState, expectedEffect) in cases {
            let (actualState, actualEffect) = RecordingReducer.reduce(state, event)
            #expect(actualState == expectedState)
            #expect(actualEffect == expectedEffect)
        }
    }

    @Test func initialConditionsMustBeReportedBeforeStarting() {

        let state = RecordingState()
        #expect(state.missing == Set(RecordingCondition.allCases))
        let (next, effect) = RecordingReducer.reduce(state, .userStart)
        #expect(next == state)
        #expect(effect == nil)
    }

    @Test(arguments: [UInt64(1), 7])
    func idleRetainsOnlyTheLatestSessionsFailure(_ id: UInt64) {

        let idle = changed(RecordingState(missing: [])) { $0.lastSessionID = id }
        let failed = changed(idle) { $0.cannotRecord = "cannot keep audio" }
        let cases: [(RecordingState, RecordingEvent, RecordingState)] = [
            (idle, .sessionReported(id: id, .cannotRecord("cannot keep audio")), failed),
            (idle, .sessionReported(id: id, .ready), idle),
            (failed, .sessionReported(id: id, .ended), failed),
            (idle, .sessionReported(id: id - 1, .cannotRecord("old failure")), idle),
            (idle, .sessionReported(id: id + 1, .cannotRecord("unknown failure")), idle),
            (RecordingState(), .sessionReported(id: 0, .cannotRecord("no Session")), RecordingState()),
        ]
        for (state, event, expected) in cases {
            let (next, effect) = RecordingReducer.reduce(state, event)
            #expect(next == expected, "Event: \(event)")
            #expect(effect == nil, "Event: \(event)")
        }
    }

    @Test(arguments: RecordingCondition.allCases)
    func partialRecoveryKeepsOtherConditionsBlockingStarts(_ recovered: RecordingCondition) {

        for remaining in RecordingCondition.allCases where remaining != recovered {
            let blocked = RecordingState(automatic: true, missing: [recovered, remaining])
            let (partial, recoveryEffect) = RecordingReducer.reduce(blocked, .conditionChanged(recovered, available: true))
            #expect(partial == changed(blocked) { $0.missing = [remaining] })
            #expect(recoveryEffect == nil)
            for start in [RecordingEvent.userStart, .callStarted] {
                let (held, startEffect) = RecordingReducer.reduce(partial, start)
                #expect(held == changed(partial) { $0.callOn = start == .callStarted })
                #expect(startEffect == nil)
            }

            let (ready, finalRecoveryEffect) = RecordingReducer.reduce(partial, .conditionChanged(remaining, available: true))
            #expect(ready == RecordingState(automatic: true, missing: []))
            #expect(finalRecoveryEffect == nil)
            for start in [RecordingEvent.userStart, .callStarted] {
                let (begun, startEffect) = RecordingReducer.reduce(ready, start)
                #expect(begun.phase == .beginning)
                #expect(begun.session == .init(id: 1, origin: start == .callStarted ? .call : .hand))
                #expect(startEffect == .beginSession(id: 1))
            }
        }
    }
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
