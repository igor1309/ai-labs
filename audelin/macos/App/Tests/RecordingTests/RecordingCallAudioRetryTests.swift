import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingCallAudioRetryTests {
    @Test(arguments: [UInt64(1), 2])
    func aCallRefusalKeepsItsAttemptWhileReleasing_state(_ id: UInt64) {
        assert(makeAudioPreparing(id), .callAudioPrepared(id: id, ready: false, liveText: false)) {
            $0.missing = [.callAudioAccess]; $0.callAudioWait = id; $0.stage = .releasing
        }
    }
    @Test(arguments: [UInt64(1), 2])
    func aCallRefusalKeepsItsAttemptWhileReleasing_effect(_ id: UInt64) {
        assert(makeAudioPreparing(id), .callAudioPrepared(id: id, ready: false, liveText: false), delivers: .releaseCallAudio(id: id))
    }

    @Test func callAudioReleaseStillReleasesTheFolderBeforeWaiting_state() {
        assert(makeAudioReleasing(), .callAudioReleased(id: 1)) { $0.stage = .releasingClaim }
    }
    @Test func callAudioReleaseStillReleasesTheFolderBeforeWaiting_effect() {
        assert(makeAudioReleasing(), .callAudioReleased(id: 1), delivers: .releaseFolder(id: 1, token: 7))
    }

    @Test(arguments: [UInt64(1), 2])
    func releasingTheClaimStartsTheNextWait_state(_ id: UInt64) {
        assert(makeAudioClaimReleasing(id), .sessionReported(id: id, .ended)) {
            $0.phase = .idle; $0.stage = nil; $0.folderToken = nil; $0.session = nil; $0.sessionBeganDuringCall = false
        }
    }
    @Test(arguments: [UInt64(1), 2])
    func releasingTheClaimStartsTheNextWait_effect(_ id: UInt64) {
        assert(makeAudioClaimReleasing(id), .sessionReported(id: id, .ended), delivers: .waitForCallAudio(id: id))
    }

    @Test(arguments: [UInt64(1), 2])
    func fiveSecondsLaterTakesANewClaimForTheCall_state(_ id: UInt64) {
        assert(makeAudioWaiting(id), .callAudioRetry(id: id)) {
            $0.callAudioWait = nil; $0.phase = .beginning; $0.stage = .claiming; $0.lastSessionID = id + 1
            $0.session = .init(id: id + 1, origin: .call); $0.sessionBeganDuringCall = true
        }
    }
    @Test(arguments: [UInt64(1), 2])
    func fiveSecondsLaterTakesANewClaimForTheCall_effect(_ id: UInt64) {
        assert(makeAudioWaiting(id), .callAudioRetry(id: id), delivers: .claimFolder(id: id + 1))
    }

    @Test func restoredCallAudioTakesTheClaimAtOnce_state() {
        assert(makeAudioWaiting(), .conditionChanged(.callAudioAccess, available: true)) {
            $0.missing = []; $0.callAudioWait = nil; $0.phase = .beginning; $0.stage = .claiming
            $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true
        }
    }
    @Test func restoredCallAudioTakesTheClaimAtOnce_effect() {
        assert(makeAudioWaiting(), .conditionChanged(.callAudioAccess, available: true), delivers: .claimFolder(id: 2))
    }

    @Test func restoredAudioDuringReleaseWaitsForTheClaim_state() {
        assert(makeAudioClaimReleasing(), .conditionChanged(.callAudioAccess, available: true)) { $0.missing = [] }
    }
    @Test func restoredAudioDuringReleaseWaitsForTheClaim_effect() {
        assert(makeAudioClaimReleasing(), .conditionChanged(.callAudioAccess, available: true), delivers: nil)
    }

    @Test func restoredAudioStartsAfterReleaseWithoutWaiting_state() {
        assert(makeState(makeAudioClaimReleasing()) { $0.missing = [] }, .sessionReported(id: 1, .ended)) {
            $0.callAudioWait = nil; $0.folderToken = nil; $0.phase = .beginning; $0.stage = .claiming
            $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call)
        }
    }
    @Test func restoredAudioStartsAfterReleaseWithoutWaiting_effect() {
        assert(makeState(makeAudioClaimReleasing()) { $0.missing = [] }, .sessionReported(id: 1, .ended), delivers: .claimFolder(id: 2))
    }

    @Test func aSuccessfulRetryBeginsTheCallsPieces_state() {
        let begun = SessionReducer.reduce(SessionState(), .begin(liveText: true))
        assert(makeAudioPreparing(2), .callAudioPrepared(id: 2, ready: true, liveText: true)) {
            $0.stage = .pieces; $0.pieces = begun.0
        }
    }
    @Test func aSuccessfulRetryBeginsTheCallsPieces_effect() {
        let begun = SessionReducer.reduce(SessionState(), .begin(liveText: true))
        assert(makeAudioPreparing(2), .callAudioPrepared(id: 2, ready: true, liveText: true), delivers: begun.1.map { .session(id: 2, $0) })
    }

    @Test func theRetriedCallsPiecesComeToRecord_state() {
        let starting = makeRetriedPiecesStarting()
        assert(starting, .session(id: 2, .captureFinished(.call, error: nil))) {
            $0.phase = .recording; $0.pieces?.phase = .recording; $0.pieces?.callCapture = .up
        }
    }
    @Test func theRetriedCallsPiecesComeToRecord_effect() {
        assert(makeRetriedPiecesStarting(), .session(id: 2, .captureFinished(.call, error: nil)), delivers: nil)
    }

    @Test func aHandStartDuringAMoveReplacesTheCallAudioWait_state() {
        assert(makeState(makeAudioWaiting()) { $0.folderMoving = true }, .userStart) { $0.callAudioWait = nil; $0.pendingStart = .hand }
    }
    @Test func aHandStartDuringAMoveReplacesTheCallAudioWait_effect() {
        assert(makeState(makeAudioWaiting()) { $0.folderMoving = true }, .userStart, delivers: nil)
    }

    @Test(arguments: cancellationEvents)
    func anEndedWaitCannotRetry_state(_ event: RecordingEvent) {
        assert(makeAudioWaiting(), event) { cancelWait(&$0, event) }
        let ended = makeState(makeAudioWaiting()) { cancelWait(&$0, event) }
        assert(ended, .callAudioRetry(id: 1))
    }
    @Test(arguments: cancellationEvents)
    func anEndedWaitCannotRetry_effect(_ event: RecordingEvent) {
        assert(makeAudioWaiting(), event, delivers: nil)
        let ended = makeState(makeAudioWaiting()) { cancelWait(&$0, event) }
        assert(ended, .callAudioRetry(id: 1), delivers: nil)
    }

    @Test(arguments: cancellationEvents)
    func anEndedWaitDuringReleaseIsNotScheduled_state(_ event: RecordingEvent) {
        assert(makeAudioClaimReleasing(), event) { cancelReleasingWait(&$0, event) }
        let cancelled = makeCancelledAudioRelease(event)
        assert(cancelled, .sessionReported(id: 1, .ended)) {
            $0.phase = .idle; $0.stage = nil; $0.folderToken = nil; $0.session = nil; $0.sessionBeganDuringCall = false
            if $0.shutdown == .requested { $0.shutdown = .settled }
        }
    }
    @Test(arguments: cancellationEvents)
    func anEndedWaitDuringReleaseIsNotScheduled_effect(_ event: RecordingEvent) {
        assert(makeAudioClaimReleasing(), event, delivers: nil)
        let cancelled = makeCancelledAudioRelease(event)
        assert(cancelled, .sessionReported(id: 1, .ended), delivers: nil)
    }

    @Test(arguments: [false, true])
    func aHandRefusalDoesNotWaitEvenDuringACall_state(_ callOn: Bool) {
        let hand = makeState(makeBeginning()) { $0.callOn = callOn; $0.folderToken = 7 }
        assert(hand, .callAudioPrepared(id: 1, ready: false, liveText: false)) { $0.stage = .releasing; $0.missing = [.callAudioAccess] }
        assert(makeState(makeAudioClaimReleasing()) { $0.callAudioWait = nil; $0.session = .init(id: 1, origin: .hand) }, .sessionReported(id: 1, .ended)) {
            $0.phase = .idle; $0.stage = nil; $0.folderToken = nil; $0.session = nil; $0.sessionBeganDuringCall = false
        }
    }
    @Test(arguments: [false, true])
    func aHandRefusalDoesNotWaitEvenDuringACall_effect(_ callOn: Bool) {
        let hand = makeState(makeBeginning()) { $0.callOn = callOn; $0.folderToken = 7 }
        assert(hand, .callAudioPrepared(id: 1, ready: false, liveText: false), delivers: .releaseCallAudio(id: 1))
        assert(makeState(makeAudioClaimReleasing()) { $0.callAudioWait = nil; $0.session = .init(id: 1, origin: .hand) }, .sessionReported(id: 1, .ended), delivers: nil)
    }

    @Test(arguments: [RecordingCondition.microphoneAccess, .callsFolder, .room])
    func aRefusalWithAnotherMissingConditionDoesNotWait_state(_ condition: RecordingCondition) {
        assert(makeState(makeAudioPreparing()) { $0.missing = [condition] }, .callAudioPrepared(id: 1, ready: false, liveText: false)) {
            $0.missing.insert(.callAudioAccess); $0.stage = .releasing
        }
    }
    @Test(arguments: [RecordingCondition.microphoneAccess, .callsFolder, .room])
    func aRefusalWithAnotherMissingConditionDoesNotWait_effect(_ condition: RecordingCondition) {
        assert(makeState(makeAudioPreparing()) { $0.missing = [condition] }, .callAudioPrepared(id: 1, ready: false, liveText: false), delivers: .releaseCallAudio(id: 1))
    }

    @Test(arguments: [RecordingEvent.conditionChanged(.callAudioAccess, available: false), .conditionChanged(.room, available: true), .automaticChanged(true), .callStarted, .callAudioRetry(id: 0)])
    func unrelatedEventsDoNotRestartTheWait_state(_ event: RecordingEvent) { assert(makeAudioWaiting(), event) }
    @Test(arguments: [RecordingEvent.conditionChanged(.callAudioAccess, available: false), .conditionChanged(.room, available: true), .automaticChanged(true), .callStarted, .callAudioRetry(id: 0)])
    func unrelatedEventsDoNotRestartTheWait_effect(_ event: RecordingEvent) { assert(makeAudioWaiting(), event, delivers: nil) }

    @Test func anOldTimerCannotRetryANewerWait_state() { assert(makeAudioWaiting(2), .callAudioRetry(id: 1)) }
    @Test func anOldTimerCannotRetryANewerWait_effect() { assert(makeAudioWaiting(2), .callAudioRetry(id: 1), delivers: nil) }

    @Test func aTimerCannotSkipClaimRelease_state() { assert(makeAudioClaimReleasing(), .callAudioRetry(id: 1)) }
    @Test func aTimerCannotSkipClaimRelease_effect() { assert(makeAudioClaimReleasing(), .callAudioRetry(id: 1), delivers: nil) }

    @Test func aRetryDuringAMoveWaitsForTheMove_state() {
        assert(makeState(makeAudioWaiting()) { $0.folderMoving = true }, .callAudioRetry(id: 1)) { $0.callAudioWait = nil; $0.pendingStart = .call }
    }
    @Test func aRetryDuringAMoveWaitsForTheMove_effect() {
        assert(makeState(makeAudioWaiting()) { $0.folderMoving = true }, .callAudioRetry(id: 1), delivers: nil)
    }
}

private func makeAudioPreparing(_ id: UInt64 = 1) -> RecordingState {
    makeState(makeCall()) { $0.lastSessionID = id; $0.session = .init(id: id, origin: .call); $0.folderToken = 7 }
}
private func makeAudioReleasing(_ id: UInt64 = 1) -> RecordingState {
    makeState(makeAudioPreparing(id)) { $0.stage = .releasing; $0.missing = [.callAudioAccess]; $0.callAudioWait = id }
}
private func makeAudioClaimReleasing(_ id: UInt64 = 1) -> RecordingState {
    makeState(makeAudioReleasing(id)) { $0.stage = .releasingClaim }
}
private func makeAudioWaiting(_ id: UInt64 = 1) -> RecordingState {
    makeState(makeIdle()) { $0.callOn = true; $0.lastSessionID = id; $0.missing = [.callAudioAccess]; $0.callAudioWait = id }
}
private let cancellationEvents: [RecordingEvent] = [
    .callEnded, .userStop, .automaticChanged(false), .conditionChanged(.microphoneAccess, available: false),
    .conditionChanged(.callsFolder, available: false), .conditionChanged(.room, available: false), .shutdown,
]
private func cancelWait(_ state: inout RecordingState, _ event: RecordingEvent) {
    state.callAudioWait = nil
    switch event {
    case .callEnded: state.callOn = false
    case .userStop: state.heldForCall = true
    case .automaticChanged: state.automatic = false
    case let .conditionChanged(condition, _): state.missing.insert(condition)
    case .shutdown: state.shutdown = .settled
    default: Issue.record("unexpected cancellation \(event)")
    }
}

private func makeCancelledAudioRelease(_ event: RecordingEvent) -> RecordingState {
    makeState(makeAudioClaimReleasing()) { cancelReleasingWait(&$0, event) }
}
private func cancelReleasingWait(_ state: inout RecordingState, _ event: RecordingEvent) {
    cancelWait(&state, event)
    switch event {
    case .callEnded, .userStop, .conditionChanged(.callsFolder, _), .conditionChanged(.room, _): state.phase = .ending
    case .shutdown: state.phase = .ending; state.shutdown = .requested
    default: break
    }
}

private func makeRetriedPiecesStarting() -> RecordingState {
    makeState(makeAudioPreparing(2)) {
        $0.stage = .pieces; $0.pieces = makeRecordingPieces(); $0.pieces?.phase = .bringingUp; $0.pieces?.callCapture = .starting
    }
}
