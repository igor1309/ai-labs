import RecordingConditions
import Testing

struct RecordingConditionsReducerTests {

    @Test func firstDiskReadingPublishesFolderAndRoom_state() {
        assert(makeState(), .diskRead(roomy)) { $0.disk = roomy; $0.published = [.callsFolder: true, .room: true] }
    }
    @Test func firstDiskReadingPublishesFolderAndRoom_effect() {
        assert(makeState(), .diskRead(roomy), delivers: .publish([.callsFolder: true, .room: true]))
    }

    @Test func firstMicrophoneAnswerPublishesIt_state() {
        assert(makeState(), .microphoneRead(false)) { $0.microphoneAccess = false; $0.published = [.microphoneAccess: false] }
    }
    @Test func firstMicrophoneAnswerPublishesIt_effect() {
        assert(makeState(), .microphoneRead(false), delivers: .publish([.microphoneAccess: false]))
    }

    @Test func accessResultPublishesOnlyCallAudioAccess_state() {
        assert(makeAvailableState(), .callAudioAccess(false)) { $0.callAudioAccess = false; $0.published[.callAudioAccess] = false }
    }
    @Test func accessResultPublishesOnlyCallAudioAccess_effect() {
        assert(makeAvailableState(), .callAudioAccess(false), delivers: .publish([.callAudioAccess: false]))
    }

    @Test func unchangedDiskReadingPublishesNothing_state() { assert(makeAvailableState(), .diskRead(roomy)) }
    @Test func unchangedDiskReadingPublishesNothing_effect() { assert(makeAvailableState(), .diskRead(roomy), delivers: nil) }

    @Test func unchangedAccessPublishesNothing_state() { assert(makeAvailableState(), .callAudioAccess(true)) }
    @Test func unchangedAccessPublishesNothing_effect() { assert(makeAvailableState(), .callAudioAccess(true), delivers: nil) }

    /// Different readings with the same outcome change the state but publish nothing.
    @Test func newReadingWithSameOutcomePublishesNothing_state() {
        let more = DiskReadings(folderExists: true, writable: true, availableCapacity: 50_000_000_000)
        assert(makeAvailableState(), .diskRead(more)) { $0.disk = more }
    }
    @Test func newReadingWithSameOutcomePublishesNothing_effect() {
        assert(makeAvailableState(), .diskRead(.init(folderExists: true, writable: true, availableCapacity: 50_000_000_000)), delivers: nil)
    }

    @Test func fullDiskPublishesNoRoom_state() {
        assert(makeAvailableState(), .diskRead(full)) { $0.disk = full; $0.published[.room] = false }
    }
    @Test func fullDiskPublishesNoRoom_effect() { assert(makeAvailableState(), .diskRead(full), delivers: .publish([.room: false])) }

    @Test func missingFolderPublishesNoFolderAndNoRoom_state() {
        assert(makeAvailableState(), .diskRead(missing)) { $0.disk = missing; $0.published[.callsFolder] = false; $0.published[.room] = false }
    }
    @Test func missingFolderPublishesNoFolderAndNoRoom_effect() {
        assert(makeAvailableState(), .diskRead(missing), delivers: .publish([.callsFolder: false, .room: false]))
    }

    @Test func readOnlyFolderPublishesNoFolder_state() {
        let readOnly = DiskReadings(folderExists: true, writable: false, availableCapacity: 40_000_000_000)
        assert(makeAvailableState(), .diskRead(readOnly)) { $0.disk = readOnly; $0.published[.callsFolder] = false }
    }
    @Test func readOnlyFolderPublishesNoFolder_effect() {
        let readOnly = DiskReadings(folderExists: true, writable: false, availableCapacity: 40_000_000_000)
        assert(makeAvailableState(), .diskRead(readOnly), delivers: .publish([.callsFolder: false]))
    }

    @Test func storageMoveSuppressesTheFolder_state() {
        assert(makeAvailableState(), .storageMoving(true)) { $0.storageMoving = true; $0.published[.callsFolder] = false }
    }
    @Test func storageMoveSuppressesTheFolder_effect() {
        assert(makeAvailableState(), .storageMoving(true), delivers: .publish([.callsFolder: false]))
    }

    @Test func storageMoveBeforeAnyReadingSuppressesTheFolder_state() {
        assert(makeState(), .storageMoving(true)) { $0.storageMoving = true; $0.published = [.callsFolder: false] }
    }
    @Test func storageMoveBeforeAnyReadingSuppressesTheFolder_effect() {
        assert(makeState(), .storageMoving(true), delivers: .publish([.callsFolder: false]))
    }

    /// A reading taken while storage moves cannot lift the suppression.
    @Test func readingDuringAMoveKeepsTheFolderSuppressed_state() {
        assert(makeAvailableState(moving: true), .diskRead(roomy))
    }
    @Test func readingDuringAMoveKeepsTheFolderSuppressed_effect() {
        assert(makeAvailableState(moving: true), .diskRead(roomy), delivers: nil)
    }

    @Test func endOfAMoveRestoresTheFolderFromTheLatestReading_state() {
        assert(makeAvailableState(moving: true), .storageMoving(false)) { $0.storageMoving = false; $0.published[.callsFolder] = true }
    }
    @Test func endOfAMoveRestoresTheFolderFromTheLatestReading_effect() {
        assert(makeAvailableState(moving: true), .storageMoving(false), delivers: .publish([.callsFolder: true]))
    }

    /// A reading newer than the one before the move decides what the end of the move restores.
    @Test func endOfAMoveUsesAReadingTakenDuringIt_state() {
        var given = makeAvailableState(moving: true)
        given.disk = missing
        given.published[.room] = false
        assert(given, .storageMoving(false)) { $0.storageMoving = false }
    }
    @Test func endOfAMoveUsesAReadingTakenDuringIt_effect() {
        var given = makeAvailableState(moving: true)
        given.disk = missing
        given.published[.room] = false
        assert(given, .storageMoving(false), delivers: nil)
    }

    @Test func repeatedMoveStartPublishesNothing_state() { assert(makeAvailableState(moving: true), .storageMoving(true)) }
    @Test func repeatedMoveStartPublishesNothing_effect() { assert(makeAvailableState(moving: true), .storageMoving(true), delivers: nil) }
}
