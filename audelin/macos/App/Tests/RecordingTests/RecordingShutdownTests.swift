import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingShutdownTests {

    @Test func shutdownWhileIdleSettles() { assert(makeIdle(), .shutdown) { $0.shutdown = .settled } }

    @Test func shutdownWhileRecordingEndsTheSession() { assert(makeRunning(), .shutdown) { $0.phase = .ending; endPieces(&$0); $0.shutdown = .requested } }

    @Test func shutdownWhileBeginningEndsTheSession() { assert(makeBeginning(), .shutdown) { $0.phase = .ending; $0.shutdown = .requested } }

    @Test func shutdownWhileEndingWaitsForTheEnd() { assert(makeEnding(), .shutdown) { $0.shutdown = .requested } }

    @Test func shutdownDropsAPendingCall() { assert(makePending(), .shutdown) { $0.pendingCall = false; $0.shutdown = .requested } }

    @Test func shutdownDropsAPendingStart() { assert(makeState(makeIdle()) { $0.folderMoving = true; $0.pendingStart = .hand }, .shutdown) { $0.pendingStart = nil; $0.shutdown = .settled } }

    @Test func secondShutdownChangesNothing() { assert(makeShuttingDown(), .shutdown) }

    @Test func theEndedSessionSettles() { assert(makeShuttingDown(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil; $0.shutdown = .settled } }

    @Test func anotherSessionsEndDoesNotSettle() { assert(makeShuttingDown(), .sessionReported(id: 99, .ended)) }

    @Test func userStartAfterShutdownChangesNothing() { assert(makeSettled(), .userStart) }

    @Test func callStartedAfterShutdownBeginsNothing() { assert(makeSettled(), .callStarted) { $0.callOn = true } }

    @Test func aStartWhileMovingAfterShutdownIsNotKept() { assert(makeState(makeSettled()) { $0.folderMoving = true }, .userStart) }

    @Test func theMoveEndingAfterShutdownBeginsNothing() {
        assert(makeState(makeSettled()) { $0.folderMoving = true }, .conditionChanged(.callsFolder, available: true)) { $0.folderMoving = false; $0.moveEnds = 1 }
    }
}

private func makeShuttingDown() -> RecordingState { makeState(makeEnding()) { $0.shutdown = .requested } }
private func makeSettled() -> RecordingState { makeState(makeIdle()) { $0.shutdown = .settled } }
