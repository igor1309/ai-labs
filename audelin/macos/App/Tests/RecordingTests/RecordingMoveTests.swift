import Recording
import Testing

struct RecordingMoveTests {

    @Test func idleReservesStorage() { assert(makeIdle(), .reserveStorage) { $0.storageReserved = true } }

    @Test func userStartDuringAMoveIsQueued() { assert(makeReserved(), .userStart) { $0.pendingStart = .hand } }

    @Test func callStartDuringAMoveIsQueued() { assert(makeReserved(), .callStarted) { $0.pendingStart = .call; $0.callOn = true } }

    @Test func releaseBeginsAQueuedUserStart() {
        assert(makeQueued(.hand), .releaseStorage) {
            $0.storageReserved = false; $0.pendingStart = nil; $0.phase = .beginning
            $0.lastSessionID = 1; $0.session = .init(id: 1, origin: .hand)
        }
    }

    @Test func releaseBeginsAQueuedCallStart() {
        assert(makeQueued(.call), .releaseStorage) {
            $0.storageReserved = false; $0.pendingStart = nil; $0.phase = .beginning
            $0.lastSessionID = 1; $0.session = .init(id: 1, origin: .call); $0.sessionBeganDuringCall = true
        }
    }

    @Test func releaseWithoutTheFolderKeepsTheStartQueued() { assert(makeQueuedWithoutFolder(), .releaseStorage) { $0.storageReserved = false } }

    @Test func userStopCancelsAQueuedStart() { assert(makeQueuedWithoutFolder(), .userStop) { $0.pendingStart = nil } }

    @Test func folderReturningDuringAMoveKeepsTheStartQueued() { assert(makeQueuedWithoutFolder(), .conditionChanged(.callsFolder, available: true)) { $0.missing = [] } }

    @Test func folderReturningAfterReleaseBeginsTheQueuedStart() {
        assert(makeState(makeQueuedWithoutFolder()) { $0.storageReserved = false }, .conditionChanged(.callsFolder, available: true)) {
            $0.missing = []; $0.pendingStart = nil; $0.phase = .beginning
            $0.lastSessionID = 1; $0.session = .init(id: 1, origin: .hand)
        }
    }

    @Test func callStartKeepsAQueuedUserStart() { assert(makeQueued(.hand), .callStarted) { $0.callOn = true } }

    @Test func callEndKeepsAQueuedUserStart() { assert(makeState(makeQueued(.hand)) { $0.callOn = true }, .callEnded) { $0.callOn = false } }

    @Test func automaticOffKeepsAQueuedUserStart() { assert(makeState(makeQueued(.hand)) { $0.callOn = true }, .automaticChanged(false)) { $0.automatic = false } }

    @Test func callEndCancelsAQueuedCallStart() { assert(makeQueued(.call), .callEnded) { $0.callOn = false; $0.pendingStart = nil } }

    @Test func automaticOffCancelsAQueuedCallStart() { assert(makeQueued(.call), .automaticChanged(false)) { $0.automatic = false; $0.pendingStart = nil } }

    @Test(arguments: [makeBeginning(), makeRunning(), makeEnding()])
    func everyActivePhaseRejectsAStorageReservation(_ active: RecordingState) { assert(active, .reserveStorage) }
}
