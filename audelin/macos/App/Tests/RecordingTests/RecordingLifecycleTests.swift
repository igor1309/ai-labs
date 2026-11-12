import Recording
import Testing

struct RecordingLifecycleTests {

    @Test(arguments: [makeBeginning(), makeRunning()], [false, true])
    func callJoiningAManualRecordingOnlyMarksTheCall(_ manual: RecordingState, _ automatic: Bool) {
        assert(makeState(manual) { $0.automatic = automatic }, .callStarted) { $0.callOn = true }
    }

    @Test(arguments: [makeBeginning(), makeRunning()], [false, true])
    func callLeavingAManualRecordingOnlyClearsTheCall(_ manual: RecordingState, _ automatic: Bool) {
        assert(makeState(manual) { $0.automatic = automatic; $0.callOn = true }, .callEnded) { $0.callOn = false }
    }

    @Test(arguments: [RecordingSessionReport.ready, .cannotRecord("late failure"), .ended])
    func aLateReportOfTheLastSessionLeavesTheNextOneAlone(_ report: RecordingSessionReport) {
        assert(makeRunning(id: 2), .sessionReported(id: 1, report))
    }

    @Test func userStartWhileEndingChangesNothing() { assert(makeEnding(), .userStart) }

    @Test func micLostAfterAFailureKeepsIt() {
        assert(makeFailedAfter(1), .conditionChanged(.microphoneAccess, available: false)) { $0.missing = [.microphoneAccess] }
    }

    @Test func automaticOffAfterAFailureKeepsIt() { assert(makeState(makeFailedAfter(1)) { $0.automatic = true }, .automaticChanged(false)) { $0.automatic = false } }

    @Test func micReturningAfterAFailureKeepsIt() {
        assert(makeState(makeFailedAfter(1)) { $0.missing = [.microphoneAccess] }, .conditionChanged(.microphoneAccess, available: true)) { $0.missing = [] }
    }

    @Test(arguments: RecordingCondition.allCases)
    func aConditionLostWhileACallWaitsIsRecorded(_ condition: RecordingCondition) {
        assert(makePending(), .conditionChanged(condition, available: false)) { $0.missing = [condition] }
    }

    @Test(arguments: RecordingCondition.allCases.filter { $0 != .callAudioAccess })
    func aWaitingCallIsDroppedWhenAConditionIsMissing(_ condition: RecordingCondition) {
        assert(makeState(makePending()) { $0.missing = [condition] }, .sessionReported(id: 1, .ended)) {
            $0.phase = .idle; $0.session = nil; $0.pendingCall = false
        }
    }

    @Test func aWaitingCallWithoutCallAudioBeginsForTheDoerToRecheck() {
        assert(makeState(makePending()) { $0.missing = [.callAudioAccess] }, .sessionReported(id: 1, .ended)) {
            $0.phase = .beginning; $0.pendingCall = false; $0.lastSessionID = 2
            $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true
        }
    }

    @Test func automaticOffDropsTheWaitingCall() { assert(makePending(), .automaticChanged(false)) { $0.automatic = false; $0.pendingCall = false } }

    @Test func endingWithAutomaticOffKeepsTheCallOn() {
        assert(makeState(makeEnding()) { $0.automatic = false; $0.callOn = true }, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.session = nil }
    }

    @Test func userStopHoldsTheWaitingCallUntilItEnds() { assert(makePending(), .userStop) { $0.pendingCall = false; $0.heldForCall = true } }

    @Test func aHeldCallEndingIsNotBegun() {
        assert(makeState(makeEnding()) { $0.callOn = true; $0.heldForCall = true }, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.session = nil }
    }

    @Test func callStartWhileHeldChangesNothing() { assert(makeState(makeIdleAfter(1)) { $0.automatic = true; $0.callOn = true; $0.heldForCall = true }, .callStarted) }

    @Test func aRepeatedCallEndLeavesAManualRecordingAlone() { assert(makeRunning(id: 2), .callEnded) }

    @Test(arguments: [RecordingCondition.callsFolder, .room])
    func storageLostWhileBeginningEndsTheSession(_ condition: RecordingCondition) {
        assert(makeBeginning(), .conditionChanged(condition, available: false)) { $0.phase = .ending; $0.missing = [condition] }
    }

    @Test func aFailedCallSessionEndingWhileTheCallStaysOnGoesIdle() {
        assert(makeState(makeCall()) { $0.phase = .ending; $0.cannotRecord = "no recording possible" }, .sessionReported(id: 1, .ended)) {
            $0.phase = .idle; $0.session = nil; $0.sessionBeganDuringCall = false
        }
    }

    @Test func aDeferredCallWithoutCallAudioEndingGoesIdle() {
        assert(makeState(makeDeferredCall()) { $0.missing = [.callAudioAccess] }, .sessionReported(id: 2, .ended)) {
            $0.phase = .idle; $0.session = nil; $0.sessionBeganDuringCall = false
        }
    }

    @Test func aFailedCallIsNotBegunAgain() {
        assert(makeState(makeIdleAfter(1)) { $0.automatic = true; $0.callOn = true; $0.cannotRecord = "no recording possible" }, .callStarted)
    }
}
