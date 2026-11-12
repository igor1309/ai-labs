import Recording
import Testing

struct RecordingCallTests {

    @Test func callWithAutomaticOffOnlyMarksTheCall() { assert(makeManualIdle(), .callStarted) { $0.callOn = true } }

    @Test func userStartWithAutomaticOffBeginsAHandSession() {
        assert(makeManualIdle(), .userStart) { $0.phase = .beginning; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 }
    }

    @Test func userStartDuringACallBeginsAHandSessionOfThatCall() {
        assert(makeState(makeManualIdle()) { $0.callOn = true }, .userStart) {
            $0.phase = .beginning; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1; $0.sessionBeganDuringCall = true
        }
    }

    @Test func endedSessionGoesIdle() { assert(makeEnding(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.session = nil } }

    @Test(arguments: [RecordingState.Origin.call, .hand], [RecordingState.Phase.beginning, .recording])
    func callEndEndsASessionBegunDuringTheCall(_ origin: RecordingState.Origin, _ phase: RecordingState.Phase) {
        assert(makeDuringCall(origin, phase), .callEnded) { $0.phase = .ending; $0.callOn = false }
    }

    @Test(arguments: [RecordingEvent.callStarted, .userStart], [RecordingState.Phase.beginning, .recording])
    func anotherStartKeepsTheCallSession(_ start: RecordingEvent, _ phase: RecordingState.Phase) {
        assert(makeDuringCall(.call, phase), start)
    }

    @Test func userStopDuringACallBeginningEndsIt() { assert(makeCall(), .userStop) { $0.phase = .ending; $0.heldForCall = true } }

    @Test func userStopDuringACallHoldsItUntilTheCallEnds() {
        assert(makeDuringCall(.call, .recording), .userStop) { $0.phase = .ending; $0.heldForCall = true }
    }

    @Test func endingAHeldCallStaysIdle() {
        assert(makeState(makeEnding()) { $0.callOn = true; $0.heldForCall = true; $0.sessionBeganDuringCall = true }, .sessionReported(id: 1, .ended)) {
            $0.phase = .idle; $0.session = nil; $0.sessionBeganDuringCall = false
        }
    }

    @Test(arguments: [false, true])
    func automaticChangesKeepTheCallHeld(_ automatic: Bool) {
        assert(makeState(makeHeld()) { $0.automatic = !automatic }, .automaticChanged(automatic)) { $0.automatic = automatic }
    }

    @Test func theHeldCallEndingReleasesTheHold() { assert(makeHeld(), .callEnded) { $0.callOn = false; $0.heldForCall = false } }

    @Test func aNewCallAfterTheHoldBeginsSessionTwo() {
        assert(makeState(makeIdleAfter(1)) { $0.automatic = true }, .callStarted) {
            $0.callOn = true; $0.phase = .beginning; $0.lastSessionID = 2
            $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true
        }
    }
}

private func makeManualIdle() -> RecordingState { RecordingState(automatic: false, missing: []) }

private func makeDuringCall(_ origin: RecordingState.Origin, _ phase: RecordingState.Phase) -> RecordingState {
    makeState(makeBeginning()) {
        $0.phase = phase
        $0.session = .init(id: 1, origin: origin)
        $0.callOn = true
        $0.sessionBeganDuringCall = true
    }
}

private func makeHeld() -> RecordingState { makeState(makeIdleAfter(1)) { $0.automatic = true; $0.callOn = true; $0.heldForCall = true } }
