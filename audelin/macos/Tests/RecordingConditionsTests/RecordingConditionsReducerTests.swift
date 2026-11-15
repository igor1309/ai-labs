import RecordingConditions
import Testing

struct RecordingConditionsReducerTests {

    @Test func firstReadingsPublishMicrophoneFolderAndRoom_state() {
        assert(makeState(), .read(makeReadings())) {
            $0.readings = makeReadings(); $0.published = [.microphoneAccess: .available, .callsFolder: .available, .room: .available]
        }
    }
    @Test func firstReadingsPublishMicrophoneFolderAndRoom_effect() {
        assert(makeState(), .read(makeReadings()), delivers: .publish([.microphoneAccess: .available, .callsFolder: .available, .room: .available]))
    }

    @Test func firstAccessResultPublishesIt_state() {
        assert(makeState(), .callAudioAccess(false)) { $0.callAudioAccess = false; $0.published = [.callAudioAccess: .unavailable] }
    }
    @Test func firstAccessResultPublishesIt_effect() {
        assert(makeState(), .callAudioAccess(false), delivers: .publish([.callAudioAccess: .unavailable]))
    }

    @Test func accessResultPublishesOnlyCallAudioAccess_state() {
        assert(makeAvailableState(), .callAudioAccess(false)) { $0.callAudioAccess = false; $0.published[.callAudioAccess] = .unavailable }
    }
    @Test func accessResultPublishesOnlyCallAudioAccess_effect() {
        assert(makeAvailableState(), .callAudioAccess(false), delivers: .publish([.callAudioAccess: .unavailable]))
    }

    @Test func unchangedReadingsPublishNothing_state() {
        assert(makeAvailableState(), .read(makeReadings(at: 2))) { $0.readings = makeReadings(at: 2) }
    }
    @Test func unchangedReadingsPublishNothing_effect() { assert(makeAvailableState(), .read(makeReadings(at: 2)), delivers: nil) }

    @Test func unchangedAccessPublishesNothing_state() { assert(makeAvailableState(), .callAudioAccess(true)) }
    @Test func unchangedAccessPublishesNothing_effect() { assert(makeAvailableState(), .callAudioAccess(true), delivers: nil) }

    @Test func refusedMicrophonePublishesOnlyIt_state() {
        assert(makeAvailableState(), .read(makeReadings(microphone: false, at: 2))) {
            $0.readings = makeReadings(microphone: false, at: 2); $0.published[.microphoneAccess] = .unavailable
        }
    }
    @Test func refusedMicrophonePublishesOnlyIt_effect() {
        assert(makeAvailableState(), .read(makeReadings(microphone: false, at: 2)), delivers: .publish([.microphoneAccess: .unavailable]))
    }

    @Test func fullDiskPublishesNoRoom_state() {
        assert(makeAvailableState(), .read(makeReadings(full, at: 2))) { $0.readings = makeReadings(full, at: 2); $0.published[.room] = .unavailable }
    }
    @Test func fullDiskPublishesNoRoom_effect() { assert(makeAvailableState(), .read(makeReadings(full, at: 2)), delivers: .publish([.room: .unavailable])) }

    @Test func missingFolderPublishesNoFolderAndNoRoom_state() {
        assert(makeAvailableState(), .read(makeReadings(missing, at: 2))) {
            $0.readings = makeReadings(missing, at: 2); $0.published[.callsFolder] = .unavailable; $0.published[.room] = .unavailable
        }
    }
    @Test func missingFolderPublishesNoFolderAndNoRoom_effect() {
        assert(makeAvailableState(), .read(makeReadings(missing, at: 2)), delivers: .publish([.callsFolder: .unavailable, .room: .unavailable]))
    }

    @Test func readOnlyFolderPublishesNoFolder_state() {
        let readOnly = makeReadings(.init(folderExists: true, writable: false, availableCapacity: 40_000_000_000), at: 2)
        assert(makeAvailableState(), .read(readOnly)) { $0.readings = readOnly; $0.published[.callsFolder] = .unavailable }
    }
    @Test func readOnlyFolderPublishesNoFolder_effect() {
        let readOnly = makeReadings(.init(folderExists: true, writable: false, availableCapacity: 40_000_000_000), at: 2)
        assert(makeAvailableState(), .read(readOnly), delivers: .publish([.callsFolder: .unavailable]))
    }

    /// Readings taken before the latest ones arrive late and change nothing.
    @Test func staleReadingsAreIgnored_state() { assert(makeAvailableState(), .read(makeReadings(missing, microphone: false, at: 0))) }
    @Test func staleReadingsAreIgnored_effect() {
        assert(makeAvailableState(), .read(makeReadings(missing, microphone: false, at: 0)), delivers: nil)
    }

    @Test func readingsTakenAtTheSameMomentReplace_state() {
        assert(makeAvailableState(), .read(makeReadings(full))) { $0.readings = makeReadings(full); $0.published[.room] = .unavailable }
    }
    @Test func readingsTakenAtTheSameMomentReplace_effect() {
        assert(makeAvailableState(), .read(makeReadings(full)), delivers: .publish([.room: .unavailable]))
    }

    // S-1
    @Test func aMoveMakesTheFolderMoving_state() {
        assert(makeAvailableState(), .storageMoving(true)) { $0.storageMoving = true; $0.moves = 1; $0.published[.callsFolder] = .moving }
    }
    @Test func aMoveMakesTheFolderMoving_effect() {
        assert(makeAvailableState(), .storageMoving(true), delivers: .publish([.callsFolder: .moving]))
    }

    @Test func aMoveBeforeAnyReadingMakesTheFolderMoving_state() {
        assert(makeState(), .storageMoving(true)) { $0.storageMoving = true; $0.moves = 1; $0.published = [.callsFolder: .moving] }
    }
    @Test func aMoveBeforeAnyReadingMakesTheFolderMoving_effect() {
        assert(makeState(), .storageMoving(true), delivers: .publish([.callsFolder: .moving]))
    }

    // S-2
    @Test func aLostFolderThatStartsMovingIsPublishedAgain_state() {
        var given = makeAvailableState(); given.readings = makeReadings(missing); given.published[.callsFolder] = .unavailable; given.published[.room] = .unavailable
        assert(given, .storageMoving(true)) { $0.storageMoving = true; $0.moves = 1; $0.published[.callsFolder] = .moving }
    }
    @Test func aLostFolderThatStartsMovingIsPublishedAgain_effect() {
        var given = makeAvailableState(); given.readings = makeReadings(missing); given.published[.callsFolder] = .unavailable; given.published[.room] = .unavailable
        assert(given, .storageMoving(true), delivers: .publish([.callsFolder: .moving]))
    }

    @Test func readingDuringAMoveKeepsTheFolderMoving_state() {
        assert(makeMovingState(), .read(makeReadings(at: 2))) { $0.readings = makeReadings(at: 2) }
    }
    @Test func readingDuringAMoveKeepsTheFolderMoving_effect() {
        assert(makeMovingState(), .read(makeReadings(at: 2)), delivers: nil)
    }

    @Test func repeatedMoveStartChangesNothing_state() { assert(makeMovingState(), .storageMoving(true)) }
    @Test func repeatedMoveStartChangesNothing_effect() { assert(makeMovingState(), .storageMoving(true), delivers: nil) }

    // S-3
    @Test func theEndOfAMoveAsksForAReading_state() {
        assert(makeMovingState(), .storageMoving(false)) { $0.storageMoving = false; $0.awaitedReading = 1 }
    }
    @Test func theEndOfAMoveAsksForAReading_effect() {
        assert(makeMovingState(), .storageMoving(false), delivers: .readAfterMove(1))
    }

    @Test func theEndOfNoMoveChangesNothing_state() { assert(makeAvailableState(), .storageMoving(false)) }
    @Test func theEndOfNoMoveChangesNothing_effect() { assert(makeAvailableState(), .storageMoving(false), delivers: nil) }

    // S-4
    @Test func theAwaitedReadingEndsTheMove_state() {
        assert(makeAwaitingState(), .readAfterMove(makeReadings(at: 2), move: 1)) {
            $0.readings = makeReadings(at: 2); $0.awaitedReading = nil; $0.published[.callsFolder] = .available
        }
    }
    @Test func theAwaitedReadingEndsTheMove_effect() {
        assert(makeAwaitingState(), .readAfterMove(makeReadings(at: 2), move: 1), delivers: .publish([.callsFolder: .available]))
    }

    // S-5
    @Test func theAwaitedReadingCanFindTheFolderLost_state() {
        assert(makeAwaitingState(), .readAfterMove(makeReadings(missing, at: 2), move: 1)) {
            $0.readings = makeReadings(missing, at: 2); $0.awaitedReading = nil
            $0.published[.callsFolder] = .unavailable; $0.published[.room] = .unavailable
        }
    }
    @Test func theAwaitedReadingCanFindTheFolderLost_effect() {
        assert(makeAwaitingState(), .readAfterMove(makeReadings(missing, at: 2), move: 1),
               delivers: .publish([.callsFolder: .unavailable, .room: .unavailable]))
    }

    // S-6
    @Test func anotherReadingDoesNotEndTheMove_state() {
        assert(makeAwaitingState(), .read(makeReadings(at: 2))) { $0.readings = makeReadings(at: 2) }
    }
    @Test func anotherReadingDoesNotEndTheMove_effect() {
        assert(makeAwaitingState(), .read(makeReadings(at: 2)), delivers: nil)
    }

    // S-7
    @Test func aNewMoveSupersedesTheAwaitedReading_state() {
        assert(makeAwaitingState(), .storageMoving(true)) { $0.storageMoving = true; $0.moves = 2; $0.awaitedReading = nil }
    }
    @Test func aNewMoveSupersedesTheAwaitedReading_effect() {
        assert(makeAwaitingState(), .storageMoving(true), delivers: nil)
    }

    @Test func anEarlierMovesReadingDoesNotEndALaterMove_state() {
        var given = makeMovingState(); given.moves = 2
        assert(given, .readAfterMove(makeReadings(at: 2), move: 1)) { $0.readings = makeReadings(at: 2) }
    }
    @Test func anEarlierMovesReadingDoesNotEndALaterMove_effect() {
        var given = makeMovingState(); given.moves = 2
        assert(given, .readAfterMove(makeReadings(at: 2), move: 1), delivers: nil)
    }

    // S-8
    @Test func onlyTheLatestMovesReadingEndsMoving_state() {
        var given = makeAwaitingState(); given.moves = 2; given.awaitedReading = 2
        assert(given, .readAfterMove(makeReadings(at: 2), move: 1)) { $0.readings = makeReadings(at: 2) }
        var later = given; later.readings = makeReadings(at: 2)
        assert(later, .readAfterMove(makeReadings(at: 3), move: 2)) {
            $0.readings = makeReadings(at: 3); $0.awaitedReading = nil; $0.published[.callsFolder] = .available
        }
    }
    @Test func onlyTheLatestMovesReadingEndsMoving_effect() {
        var given = makeAwaitingState(); given.moves = 2; given.awaitedReading = 2
        assert(given, .readAfterMove(makeReadings(at: 2), move: 1), delivers: nil)
        var later = given; later.readings = makeReadings(at: 2)
        assert(later, .readAfterMove(makeReadings(at: 3), move: 2), delivers: .publish([.callsFolder: .available]))
    }
}
