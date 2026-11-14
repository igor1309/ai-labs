import RecordingConditions
import Testing

struct RecordingConditionsReducerTests {

    @Test func firstReadingsPublishMicrophoneFolderAndRoom_state() {
        assert(makeState(), .read(makeReadings())) {
            $0.readings = makeReadings(); $0.published = [.microphoneAccess: true, .callsFolder: true, .room: true]
        }
    }
    @Test func firstReadingsPublishMicrophoneFolderAndRoom_effect() {
        assert(makeState(), .read(makeReadings()), delivers: .publish([.microphoneAccess: true, .callsFolder: true, .room: true]))
    }

    @Test func firstAccessResultPublishesIt_state() {
        assert(makeState(), .callAudioAccess(false)) { $0.callAudioAccess = false; $0.published = [.callAudioAccess: false] }
    }
    @Test func firstAccessResultPublishesIt_effect() {
        assert(makeState(), .callAudioAccess(false), delivers: .publish([.callAudioAccess: false]))
    }

    @Test func accessResultPublishesOnlyCallAudioAccess_state() {
        assert(makeAvailableState(), .callAudioAccess(false)) { $0.callAudioAccess = false; $0.published[.callAudioAccess] = false }
    }
    @Test func accessResultPublishesOnlyCallAudioAccess_effect() {
        assert(makeAvailableState(), .callAudioAccess(false), delivers: .publish([.callAudioAccess: false]))
    }

    @Test func unchangedReadingsPublishNothing_state() {
        assert(makeAvailableState(), .read(makeReadings(at: 2))) { $0.readings = makeReadings(at: 2) }
    }
    @Test func unchangedReadingsPublishNothing_effect() { assert(makeAvailableState(), .read(makeReadings(at: 2)), delivers: nil) }

    @Test func unchangedAccessPublishesNothing_state() { assert(makeAvailableState(), .callAudioAccess(true)) }
    @Test func unchangedAccessPublishesNothing_effect() { assert(makeAvailableState(), .callAudioAccess(true), delivers: nil) }

    @Test func refusedMicrophonePublishesOnlyIt_state() {
        assert(makeAvailableState(), .read(makeReadings(microphone: false, at: 2))) {
            $0.readings = makeReadings(microphone: false, at: 2); $0.published[.microphoneAccess] = false
        }
    }
    @Test func refusedMicrophonePublishesOnlyIt_effect() {
        assert(makeAvailableState(), .read(makeReadings(microphone: false, at: 2)), delivers: .publish([.microphoneAccess: false]))
    }

    @Test func fullDiskPublishesNoRoom_state() {
        assert(makeAvailableState(), .read(makeReadings(full, at: 2))) { $0.readings = makeReadings(full, at: 2); $0.published[.room] = false }
    }
    @Test func fullDiskPublishesNoRoom_effect() { assert(makeAvailableState(), .read(makeReadings(full, at: 2)), delivers: .publish([.room: false])) }

    @Test func missingFolderPublishesNoFolderAndNoRoom_state() {
        assert(makeAvailableState(), .read(makeReadings(missing, at: 2))) {
            $0.readings = makeReadings(missing, at: 2); $0.published[.callsFolder] = false; $0.published[.room] = false
        }
    }
    @Test func missingFolderPublishesNoFolderAndNoRoom_effect() {
        assert(makeAvailableState(), .read(makeReadings(missing, at: 2)), delivers: .publish([.callsFolder: false, .room: false]))
    }

    @Test func readOnlyFolderPublishesNoFolder_state() {
        let readOnly = makeReadings(.init(folderExists: true, writable: false, availableCapacity: 40_000_000_000), at: 2)
        assert(makeAvailableState(), .read(readOnly)) { $0.readings = readOnly; $0.published[.callsFolder] = false }
    }
    @Test func readOnlyFolderPublishesNoFolder_effect() {
        let readOnly = makeReadings(.init(folderExists: true, writable: false, availableCapacity: 40_000_000_000), at: 2)
        assert(makeAvailableState(), .read(readOnly), delivers: .publish([.callsFolder: false]))
    }

    /// Readings taken before the latest ones arrive late and change nothing.
    @Test func staleReadingsAreIgnored_state() { assert(makeAvailableState(), .read(makeReadings(missing, microphone: false, at: 0))) }
    @Test func staleReadingsAreIgnored_effect() {
        assert(makeAvailableState(), .read(makeReadings(missing, microphone: false, at: 0)), delivers: nil)
    }

    @Test func readingsTakenAtTheSameMomentReplace_state() {
        assert(makeAvailableState(), .read(makeReadings(full))) { $0.readings = makeReadings(full); $0.published[.room] = false }
    }
    @Test func readingsTakenAtTheSameMomentReplace_effect() {
        assert(makeAvailableState(), .read(makeReadings(full)), delivers: .publish([.room: false]))
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

    /// Readings taken while storage moves cannot lift the suppression.
    @Test func readingDuringAMoveKeepsTheFolderSuppressed_state() {
        assert(makeAvailableState(moving: true), .read(makeReadings(at: 2))) { $0.readings = makeReadings(at: 2) }
    }
    @Test func readingDuringAMoveKeepsTheFolderSuppressed_effect() {
        assert(makeAvailableState(moving: true), .read(makeReadings(at: 2)), delivers: nil)
    }

    @Test func endOfAMoveRestoresTheFolderFromTheLatestReading_state() {
        assert(makeAvailableState(moving: true), .storageMoving(false)) { $0.storageMoving = false; $0.published[.callsFolder] = true }
    }
    @Test func endOfAMoveRestoresTheFolderFromTheLatestReading_effect() {
        assert(makeAvailableState(moving: true), .storageMoving(false), delivers: .publish([.callsFolder: true]))
    }

    /// The end of a move restores what the latest readings say, not what was published before it.
    @Test func endOfAMoveUsesReadingsTakenDuringIt_state() {
        var given = makeAvailableState(moving: true)
        given.readings = makeReadings(missing, at: 2)
        given.published[.room] = false
        assert(given, .storageMoving(false)) { $0.storageMoving = false }
    }
    @Test func endOfAMoveUsesReadingsTakenDuringIt_effect() {
        var given = makeAvailableState(moving: true)
        given.readings = makeReadings(missing, at: 2)
        given.published[.room] = false
        assert(given, .storageMoving(false), delivers: nil)
    }

    @Test func repeatedMoveStartPublishesNothing_state() { assert(makeAvailableState(moving: true), .storageMoving(true)) }
    @Test func repeatedMoveStartPublishesNothing_effect() { assert(makeAvailableState(moving: true), .storageMoving(true), delivers: nil) }
}
