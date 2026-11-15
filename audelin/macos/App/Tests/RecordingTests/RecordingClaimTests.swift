import Recording
import Testing

/// A recording claims the calls folder first and releases it last; a moving folder holds a start.
@Suite(.timeLimit(.minutes(1)))
struct RecordingClaimTests {

    // S-18
    @Test func aGrantGoesOnToCallAudio_state() {
        assert(makeClaiming(), .folderClaimed(id: 1, .granted(token: 7))) { $0.folderToken = 7; $0.stage = .preparing }
    }
    @Test func aGrantGoesOnToCallAudio_effect() {
        assert(makeClaiming(), .folderClaimed(id: 1, .granted(token: 7)), delivers: .prepareCallAudio(id: 1))
    }

    // S-19
    @Test func aStartRefusedByARelaunchEnds_state() {
        assert(makeClaiming(), .folderClaimed(id: 1, .refused)) { $0.phase = .idle; $0.stage = nil; $0.session = nil }
    }
    @Test func aStartRefusedByARelaunchEnds_effect() {
        assert(makeClaiming(), .folderClaimed(id: 1, .refused), delivers: nil)
    }

    // S-20
    @Test func aStartRefusedByAMoveWaits_state() {
        assert(makeClaiming(), .folderClaimed(id: 1, .refusedByMove)) { $0.phase = .idle; $0.stage = nil; $0.session = nil; $0.pendingStart = .hand }
    }
    @Test func aStartRefusedByAMoveWaits_effect() {
        assert(makeClaiming(), .folderClaimed(id: 1, .refusedByMove), delivers: nil)
    }

    @Test func theEndOfTheMoveBeginsAWaitingStart_state() {
        assert(makeWaiting(.hand), .conditionChanged(.callsFolder, available: true)) {
            $0.folderMoving = false; $0.moveEnds = 1; $0.pendingStart = nil
            $0.phase = .beginning; $0.stage = .claiming; $0.claimSince = 1; $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .hand)
        }
    }
    @Test func theEndOfTheMoveBeginsAWaitingStart_effect() {
        assert(makeWaiting(.hand), .conditionChanged(.callsFolder, available: true), delivers: .claimFolder(id: 2))
    }

    @Test func aLostFolderAfterTheMoveDropsAWaitingStart_state() {
        assert(makeWaiting(.hand), .conditionChanged(.callsFolder, available: false)) {
            $0.folderMoving = false; $0.moveEnds = 1; $0.pendingStart = nil; $0.missing = [.callsFolder]
        }
    }
    @Test func aLostFolderAfterTheMoveDropsAWaitingStart_effect() {
        assert(makeWaiting(.hand), .conditionChanged(.callsFolder, available: false), delivers: nil)
    }

    // S-21
    @Test func aRefusalByAMoveThatHasEndedClaimsAgain_state() {
        let late = makeState(makeClaiming()) { $0.moveEnds = 1 }
        assert(late, .folderClaimed(id: 1, .refusedByMove)) { $0.claimSince = 1 }
    }
    @Test func aRefusalByAMoveThatHasEndedClaimsAgain_effect() {
        let late = makeState(makeClaiming()) { $0.moveEnds = 1 }
        assert(late, .folderClaimed(id: 1, .refusedByMove), delivers: .claimFolder(id: 1))
    }

    // S-22
    @Test func aStartWhileTheFolderMovesWaits_state() {
        assert(makeState(makeIdle()) { $0.folderMoving = true }, .userStart) { $0.pendingStart = .hand }
    }
    @Test func aStartWhileTheFolderMovesWaits_effect() {
        assert(makeState(makeIdle()) { $0.folderMoving = true }, .userStart, delivers: nil)
    }

    @Test func aCallWhileTheFolderMovesWaits_state() {
        assert(makeState(makeIdle()) { $0.folderMoving = true }, .callStarted) { $0.callOn = true; $0.pendingStart = .call }
    }
    @Test func aCallWhileTheFolderMovesWaits_effect() {
        assert(makeState(makeIdle()) { $0.folderMoving = true }, .callStarted, delivers: nil)
    }

    // S-23
    @Test func aStopDropsAWaitingStart_state() { assert(makeWaiting(.hand), .userStop) { $0.pendingStart = nil } }
    @Test func aStopDropsAWaitingStart_effect() { assert(makeWaiting(.hand), .userStop, delivers: nil) }

    // S-24
    @Test func aCallsEndDropsItsWaitingStart_state() { assert(makeWaiting(.call), .callEnded) { $0.callOn = false; $0.pendingStart = nil } }
    @Test func aCallsEndDropsItsWaitingStart_effect() { assert(makeWaiting(.call), .callEnded, delivers: nil) }

    // S-25
    @Test func aWaitingStartByHandOutlastsTheCallsEnd_state() {
        assert(makeState(makeWaiting(.hand)) { $0.callOn = true }, .callEnded) { $0.callOn = false }
    }
    @Test func aWaitingStartByHandOutlastsTheCallsEnd_effect() {
        assert(makeState(makeWaiting(.hand)) { $0.callOn = true }, .callEnded, delivers: nil)
    }

    // S-29
    @Test func automaticOffDropsOnlyACallsWaitingStart_state() {
        assert(makeWaiting(.call), .automaticChanged(false)) { $0.automatic = false; $0.pendingStart = nil }
        assert(makeWaiting(.hand), .automaticChanged(false)) { $0.automatic = false }
    }
    @Test func automaticOffDropsOnlyACallsWaitingStart_effect() {
        assert(makeWaiting(.call), .automaticChanged(false), delivers: nil)
        assert(makeWaiting(.hand), .automaticChanged(false), delivers: nil)
    }

    // S-26
    @Test func lateNewsOfAMoveDoesNotEndARecording_state() {
        assert(makeState(makeRunning()) { $0.folderToken = 7 }, .callsFolderMoving) { $0.folderMoving = true }
    }
    @Test func lateNewsOfAMoveDoesNotEndARecording_effect() {
        assert(makeState(makeRunning()) { $0.folderToken = 7 }, .callsFolderMoving, delivers: nil)
    }

    // S-27
    @Test func releasedCallAudioReleasesTheClaim_state() {
        assert(makeReleasingWithClaim(), .callAudioReleased(id: 1)) { $0.stage = .releasingClaim }
    }
    @Test func releasedCallAudioReleasesTheClaim_effect() {
        assert(makeReleasingWithClaim(), .callAudioReleased(id: 1), delivers: .releaseFolder(id: 1, token: 7))
    }

    @Test func theReleasedClaimEndsTheSession_state() {
        let releasing = makeState(makeReleasingWithClaim()) { $0.stage = .releasingClaim }
        assert(releasing, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil; $0.folderToken = nil }
    }
    @Test func theReleasedClaimEndsTheSession_effect() {
        let releasing = makeState(makeReleasingWithClaim()) { $0.stage = .releasingClaim }
        assert(releasing, .sessionReported(id: 1, .ended), delivers: nil)
    }

    // S-28
    @Test func aStopDuringTheTakeWaitsForIt_state() { assert(makeClaiming(), .userStop) { $0.phase = .ending } }
    @Test func aStopDuringTheTakeWaitsForIt_effect() { assert(makeClaiming(), .userStop, delivers: nil) }

    @Test func aGrantAfterAStopIsReleased_state() {
        assert(makeState(makeClaiming()) { $0.phase = .ending }, .folderClaimed(id: 1, .granted(token: 7))) { $0.folderToken = 7; $0.stage = .releasingClaim }
    }
    @Test func aGrantAfterAStopIsReleased_effect() {
        assert(makeState(makeClaiming()) { $0.phase = .ending }, .folderClaimed(id: 1, .granted(token: 7)), delivers: .releaseFolder(id: 1, token: 7))
    }

    @Test func aRefusalAfterAStopEndsTheStart_state() {
        assert(makeState(makeClaiming()) { $0.phase = .ending }, .folderClaimed(id: 1, .refusedByMove)) { $0.phase = .idle; $0.stage = nil; $0.session = nil }
    }
    @Test func aRefusalAfterAStopEndsTheStart_effect() {
        assert(makeState(makeClaiming()) { $0.phase = .ending }, .folderClaimed(id: 1, .refusedByMove), delivers: nil)
    }

    @Test(arguments: [RecordingEvent.folderClaimed(id: 9, .granted(token: 1)), .callAudioReleased(id: 9)])
    func anotherSessionsAnswerIsIgnored(_ event: RecordingEvent) {
        assert(makeClaiming(), event)
        assert(makeClaiming(), event, delivers: nil)
    }
}

private func makeClaiming() -> RecordingState { makeState(makeBeginning()) { $0.stage = .claiming } }

/// Session 1 was refused by a move; a start of `origin` waits for the moving folder.
private func makeWaiting(_ origin: RecordingState.Origin) -> RecordingState {
    makeState(makeIdleAfter(1)) { $0.automatic = true; $0.folderMoving = true; $0.pendingStart = origin; $0.callOn = origin == .call }
}

private func makeReleasingWithClaim() -> RecordingState {
    makeState(makeEnding()) { $0.stage = .releasing; $0.folderToken = 7; $0.pieces = SessionReducer.reduce(makeLastPieceDown(), .outputReleased).0 }
}
