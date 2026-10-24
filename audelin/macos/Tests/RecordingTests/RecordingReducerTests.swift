import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingReducerTests {

    @Test func reducerTransitions() {

        let idle = RecordingState(automatic: true, missing: [])
        let beginning = changed(idle) {
            $0.phase = .beginning
            $0.session = .init(id: 1, origin: .hand)
            $0.lastSessionID = 1
        }
        let running = changed(beginning) { $0.phase = .recording }
        let ending = changed(running) { $0.phase = .ending }
        let pending = changed(ending) { $0.callOn = true; $0.pendingCall = true }
        let call = changed(beginning) { $0.callOn = true; $0.session = .init(id: 1, origin: .call) }
        let failed = changed(ending) { $0.cannotRecord = "cannot keep audio" }
        let ended = changed(idle) { $0.lastSessionID = 1; $0.cannotRecord = "cannot keep audio" }
        let cases: [(RecordingState, RecordingEvent, RecordingState, RecordingEffect?)] = [
            (idle, .userStart, beginning, .beginSession(id: 1)),
            (idle, .callStarted, call, .beginSession(id: 1)),
            (idle, .userStop, idle, nil),
            (idle, .callEnded, idle, nil),
            (idle, .automaticChanged(false), changed(idle) { $0.automatic = false }, nil),
            (beginning, .sessionReported(id: 1, .ready), running, nil),
            (beginning, .userStart, beginning, nil),
            (running, .userStart, running, nil),
            (running, .userStop, ending, .endSession(id: 1)),
            (beginning, .userStop, changed(beginning) { $0.phase = .ending }, .endSession(id: 1)),
            (call, .callEnded, changed(ending) { $0.session = .init(id: 1, origin: .call) }, .endSession(id: 1)),
            (ending, .userStop, ending, nil),
            (ending, .sessionReported(id: 1, .ready), ending, nil),
            (ending, .callStarted, pending, nil),
            (pending, .callEnded, ending, nil),
            (running, .sessionReported(id: 1, .cannotRecord("cannot keep audio")), failed, .endSession(id: 1)),
            (failed, .sessionReported(id: 1, .ended), ended, nil),
            (ended, .userStart, changed(beginning) { $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand) }, .beginSession(id: 2)),
            (pending, .sessionReported(id: 1, .ended), changed(call) { $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call) }, .beginSession(id: 2)),
            (running, .sessionReported(id: 99, .ended), running, nil),
            (running, .sessionReported(id: 99, .cannotRecord("old failure")), running, nil),
            (idle, .sessionReported(id: 1, .ready), idle, nil),
        ]
        for (state, event, expectedState, expectedEffect) in cases {
            let (actualState, actualEffect) = RecordingReducer.reduce(state, event)
            #expect(actualState == expectedState, "Event: \(event)")
            #expect(actualEffect == expectedEffect, "Event: \(event)")
        }
    }

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
