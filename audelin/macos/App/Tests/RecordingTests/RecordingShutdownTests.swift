import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingShutdownTests {

    @Test func shutdownWhileIdleSettles() { assert(makeIdle(), .shutdown) { $0.shutdown = .settled } }

    @Test func shutdownWhileRecordingEndsTheSession() { assert(makeRunning(), .shutdown) { $0.phase = .ending; $0.stage = .ending; $0.shutdown = .requested } }

    @Test func shutdownWhileBeginningEndsTheSession() { assert(makeBeginning(), .shutdown) { $0.phase = .ending; $0.shutdown = .requested } }

    @Test func shutdownWhileEndingWaitsForTheEnd() { assert(makeEnding(), .shutdown) { $0.shutdown = .requested } }

    @Test func shutdownDropsAPendingCall() { assert(makePending(), .shutdown) { $0.pendingCall = false; $0.shutdown = .requested } }

    @Test func shutdownDropsAPendingStart() { assert(makeState(makeReserved()) { $0.pendingStart = .hand }, .shutdown) { $0.pendingStart = nil; $0.shutdown = .settled } }

    @Test func secondShutdownChangesNothing() { assert(makeShuttingDown(), .shutdown) }

    @Test func theEndedSessionSettles() { assert(makeShuttingDown(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.session = nil; $0.shutdown = .settled } }

    @Test func anotherSessionsEndDoesNotSettle() { assert(makeShuttingDown(), .sessionReported(id: 99, .ended)) }

    @Test func userStartAfterShutdownChangesNothing() { assert(makeSettled(), .userStart) }

    @Test func callStartedAfterShutdownBeginsNothing() { assert(makeSettled(), .callStarted) { $0.callOn = true } }

    @Test func reservedStartAfterShutdownIsNotKept() { assert(makeState(makeSettled()) { $0.storageReserved = true }, .userStart) }

    @Test func releasingStorageAfterShutdownBeginsNothing() { assert(makeState(makeSettled()) { $0.storageReserved = true }, .releaseStorage) { $0.storageReserved = false } }
}

private func makeShuttingDown() -> RecordingState { makeState(makeEnding()) { $0.shutdown = .requested } }
private func makeSettled() -> RecordingState { makeState(makeIdle()) { $0.shutdown = .settled } }
