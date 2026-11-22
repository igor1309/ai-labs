import Recording
import Testing

/// One session's work runs one piece at a time: get call audio, bring the pieces up and down, release.
@Suite(.timeLimit(.minutes(1)))
struct RecordingStageTests {

    @Test func aStartClaimsTheCallsFolder() {
        let start = makeIdle()
        assert(start, .userStart) { $0.phase = .beginning; $0.stage = .claiming; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 }
        assert(start, .userStart, delivers: .claimFolder(id: 1))
    }

    @Test(arguments: [false, true])
    func preparedCallAudioBeginsThePiecesWithTheLiveTextPreferred(_ liveText: Bool) {
        let begun = SessionReducer.reduce(SessionState(), .begin(liveText: liveText))
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: true, liveText: liveText)) { $0.stage = .pieces; $0.pieces = begun.0 }
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: true, liveText: liveText), delivers: begun.1.map { .session(id: 1, $0) })
    }

    @Test func callAudioNotReadyIsMissingAndReleased() {
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: false, liveText: true)) { $0.missing = [.callAudioAccess]; $0.stage = .releasing }
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: false, liveText: true), delivers: .releaseCallAudio(id: 1))
    }

    @Test func aStopDuringPreparationSkipsThePiecesAndReleases() {
        let stopping = makeState(makeBeginning()) { $0.phase = .ending }
        assert(stopping, .callAudioPrepared(id: 1, ready: true, liveText: true)) { $0.stage = .releasing }
        assert(stopping, .callAudioPrepared(id: 1, ready: true, liveText: true), delivers: .releaseCallAudio(id: 1))
    }

    @Test func aStopDuringPreparationWaitsForIt() {
        assert(makeBeginning(), .userStop) { $0.phase = .ending }
        assert(makeBeginning(), .userStop, delivers: nil)
    }

    @Test func aStopWhileThePiecesWorkBringsDownWhatIsUp() {
        let down = SessionReducer.reduce(makeStarting().pieces!, .end)
        assert(makeStarting(), .userStop) { $0.phase = .ending; $0.pieces = down.0 }
        assert(makeStarting(), .userStop, delivers: down.1.map { .session(id: 1, $0) })
    }

    @Test func aStopWhileThePiecesWorkBringsThemDownOnTheStepsResult() {
        let stopping = makeState(makeStarting()) { $0.phase = .ending; endPieces(&$0) }
        let down = SessionReducer.reduce(stopping.pieces!, .modelsChecked(missing: []))
        assert(stopping, .session(id: 1, .modelsChecked(missing: []))) { $0.pieces = down.0 }
        assert(stopping, .session(id: 1, .modelsChecked(missing: [])), delivers: down.1.map { .session(id: 1, $0) })
    }

    @Test func aStopWhileRecordingBringsThePiecesDown() {
        let down = SessionReducer.reduce(makeRecordingPieces(), .end)
        assert(makeRunning(), .userStop) { $0.phase = .ending; $0.pieces = down.0 }
        assert(makeRunning(), .userStop, delivers: down.1.map { .session(id: 1, $0) })
    }

    @Test func aStopForTheRecordingSessionBringsThePiecesDown() {
        let down = SessionReducer.reduce(makeRecordingPieces(), .end)
        assert(makeRunning(), .stopSession(id: 1)) { $0.phase = .ending; $0.pieces = down.0 }
        assert(makeRunning(), .stopSession(id: 1), delivers: down.1.map { .session(id: 1, $0) })
    }

    @Test func aStopForAnotherSessionKeepsRecording() {
        assert(makeRunning(), .stopSession(id: 99))
        assert(makeRunning(), .stopSession(id: 99), delivers: nil)
    }

    @Test func aStopWhileIdleChangesNothing() {
        assert(makeIdle(), .stopSession(id: 1))
        assert(makeIdle(), .stopSession(id: 1), delivers: nil)
    }

    @Test func piecesThatCannotRecordAreBroughtDown() {
        let pieces = makeState(makeStarting()) { $0.pieces?.folder = .starting }
        let failed = SessionReducer.reduce(pieces.pieces!, .folderFinished(error: "no folder"))
        assert(pieces, .session(id: 1, .folderFinished(error: "no folder"))) {
            $0.pieces = SessionReducer.reduce(failed.0, .end).0
            $0.phase = .ending
            $0.cannotRecord = failed.0.cannotRecord
        }
    }

    @Test func endedPiecesReleaseCallAudio() {
        let last = makeState(makeEnding()) { $0.pieces = makeLastPieceDown() }
        assert(last, .session(id: 1, .outputReleased)) { $0.pieces = SessionReducer.reduce(makeLastPieceDown(), .outputReleased).0; $0.stage = .releasing }
        assert(last, .session(id: 1, .outputReleased), delivers: .releaseCallAudio(id: 1))
    }

    @Test func piecesEndingByThemselvesReleaseCallAudio() {
        let last = makeState(makeRunning()) { $0.pieces = makeLastPieceDown() }
        assert(last, .session(id: 1, .outputReleased), delivers: .releaseCallAudio(id: 1))
    }

    @Test func releasedCallAudioEndsTheSession() {
        assert(makeReleasing(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil }
        assert(makeReleasing(), .sessionReported(id: 1, .ended), delivers: nil)
    }

    @Test func theNextSessionClaimsOnlyAfterRelease() {
        let waiting = makeState(makeReleasing()) { $0.callOn = true; $0.pendingCall = true }
        assert(waiting, .callAudioPrepared(id: 2, ready: true, liveText: true))
        assert(waiting, .sessionReported(id: 1, .ended)) {
            $0.phase = .beginning; $0.stage = .claiming; $0.pendingCall = false; $0.pieces = nil
            $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true
        }
        assert(waiting, .sessionReported(id: 1, .ended), delivers: .claimFolder(id: 2))
    }

    @Test func shutdownSettlesOnlyOnceCallAudioIsReleased() {
        let releasing = makeState(makeReleasing()) { $0.shutdown = .requested }
        assert(releasing, .session(id: 1, .outputReleased))
        assert(releasing, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.pieces = nil; $0.session = nil; $0.shutdown = .settled }
        assert(releasing, .sessionReported(id: 1, .ended), delivers: nil)
    }

    @Test(arguments: [
        RecordingEvent.session(id: 1, .outputReleased), .callAudioPrepared(id: 1, ready: true, liveText: true),
    ])
    func aRepeatedResultWhileReleasingIsIgnored(_ event: RecordingEvent) {
        assert(makeReleasing(), event)
        assert(makeReleasing(), event, delivers: nil)
    }

    @Test(arguments: [
        RecordingEvent.session(id: 9, .end), .callAudioPrepared(id: 9, ready: true, liveText: true),
    ])
    func anotherSessionsResultIsIgnored(_ event: RecordingEvent) {
        assert(makeRunning(), event)
        assert(makeRunning(), event, delivers: nil)
    }

    @Test(arguments: [
        RecordingEvent.session(id: 1, .end), .callAudioPrepared(id: 1, ready: true, liveText: true),
    ])
    func aResultAfterTheSessionIsIgnored(_ event: RecordingEvent) {
        assert(makeIdleAfter(1), event)
        assert(makeIdleAfter(1), event, delivers: nil)
    }

    @Test func callAudioPreparedBeforePiecesIsIgnoredOnceThePiecesWork() {
        assert(makeRunning(), .callAudioPrepared(id: 1, ready: true, liveText: true))
        assert(makeRunning(), .callAudioPrepared(id: 1, ready: true, liveText: true), delivers: nil)
    }
}

/// Pieces whose only work left is releasing their output.
func makeLastPieceDown() -> SessionState {
    SessionState(phase: .ending, folder: .up, processes: .up, microphoneTrack: .closed, callTrack: .closed,
                 microphoneCapture: .closed, callCapture: .closed, transcript: .closed, callText: .closed, textFeed: .closed, output: .stopping)
}

/// Each effect reaches exactly its collaborator and answers with the event it ends in.
@Suite(.timeLimit(.minutes(1)))
struct RecordingEffectHandlerTests {

    @Test(arguments: [true, false])
    func preparingAnswersWhetherCallAudioIsReady(_ ready: Bool) async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.prepareCallAudio(id: 3))
        await spies.prepare.complete(with: ready)
        #expect(await event == .callAudioPrepared(id: 3, ready: ready, liveText: true))
    }

    @Test func aCallAudioWaitSleepsFiveSecondsBeforeRetryingItsAttempt() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.waitForCallAudio(id: 3))
        await spies.sleep.complete()
        #expect(await event == .callAudioRetry(id: 3))
        #expect(await spies.delays.calls == [.seconds(5)])
        #expect(await spies.prepare.count == 0)
    }

    @Test func releaseAnswersThatCallAudioIsReleased() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.releaseCallAudio(id: 3))
        await spies.release.complete()
        #expect(await event == .callAudioReleased(id: 3))
        #expect(await spies.release.count == 1)
    }

    @Test(arguments: [CallsFolderAnswer.granted(token: 7), .refusedByMove, .refused])
    func aClaimAnswersWithTheClaimsAnswerForItsSession(_ answer: CallsFolderAnswer) async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.claimFolder(id: 3))
        await spies.claim.complete(with: answer)
        #expect(await event == .folderClaimed(id: 3, answer))
        #expect(await spies.claim.count == 1)
    }

    @Test func aClaimReleaseReleasesItsTokenAndEndsTheSession() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.releaseFolder(id: 3, token: 7))
        await spies.releaseClaim.complete()
        #expect(await event == .sessionReported(id: 3, .ended))
        #expect(await spies.releasedTokens.calls == [7])
    }

    @Test func aPieceEffectAnswersWithThePieceResultForItsSession() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.session(id: 3, .createFolder))
        await spies.piece.complete(with: .folderFinished(error: nil))
        #expect(await event == .session(id: 3, .folderFinished(error: nil)))
        #expect(await spies.pieceCalls.calls == [.init(id: 3, effect: .createFolder)])
    }
}

private struct HandlerSpies {
    let sleep = CallSpy<Void>()
    let delays = Delays()
    let claim = CallSpy<CallsFolderAnswer>()
    let releaseClaim = CallSpy<Void>()
    let releasedTokens = Tokens()
    let prepare = CallSpy<Bool>()
    let release = CallSpy<Void>()
    let piece = CallSpy<SessionEvent>()
    let pieceCalls = PieceCalls()
}

actor Delays {
    private(set) var calls: [Duration] = []
    func record(_ duration: Duration) { calls.append(duration) }
}

actor Tokens {
    private(set) var calls: [UInt64] = []
    func record(_ token: UInt64) { calls.append(token) }
}

actor PieceCalls {
    struct Call: Equatable { let id: UInt64; let effect: SessionEffect }
    private(set) var calls: [Call] = []
    func record(_ id: UInt64, _ effect: SessionEffect) { calls.append(.init(id: id, effect: effect)) }
}

private func makeHandler() -> (RecordingEffectHandler, HandlerSpies) {
    let spies = HandlerSpies()
    let sut = RecordingEffectHandler(sleep: { delay in
                                         await spies.delays.record(delay)
                                         await spies.sleep.call()
                                     }, claimFolder: { [claim = spies.claim] in await claim.call() },
                                     releaseFolder: { [release = spies.releaseClaim, tokens = spies.releasedTokens] token in
                                         await tokens.record(token)
                                         await release.call()
                                     },
                                     prepareCallAudio: { [prepare = spies.prepare] in await prepare.call() },
                                     liveText: { true },
                                     releaseCallAudio: { [release = spies.release] in await release.call() },
                                     runPiece: { [piece = spies.piece, calls = spies.pieceCalls] id, effect in
                                         await calls.record(id, effect)
                                         return await piece.call()
                                     })
    return (sut, spies)
}

private func makeReleasing() -> RecordingState { makeState(makeEnding()) { $0.stage = .releasing; $0.pieces = SessionReducer.reduce(makeLastPieceDown(), .outputReleased).0 } }

/// The current session's pieces advance through the injected Session reducer.
@Suite(.timeLimit(.minutes(1)))
struct RecordingPiecesTests {

    @Test func aPieceEventForTheCurrentSessionAdvancesItsPieces() {
        let spy = PieceReducerSpy(stub: (SessionState(phase: .recording), .createFolder))
        let sut = RecordingReducer(session: spy.reduce, status: readStatus)
        let state = makeWithPieces()
        let event = RecordingEvent.session(id: 1, .modelsChecked(missing: []))
        let (next, effect) = sut.reduce(state, event)
        #expect(next == makeState(state) { $0.pieces = SessionState(phase: .recording) })
        #expect(effect == .session(id: 1, .createFolder))
        #expect(spy.calls == [.init(state: SessionState(phase: .bringingUp), event: .modelsChecked(missing: []))])
    }

    @Test func aPieceEventForAnotherSessionChangesNothing() {
        let spy = PieceReducerSpy(stub: (SessionState(phase: .recording), .createFolder))
        let sut = RecordingReducer(session: spy.reduce, status: readStatus)
        let state = makeWithPieces()
        #expect(sut.reduce(state, .session(id: 2, .end)).0 == state)
        #expect(sut.reduce(state, .session(id: 2, .end)).1 == nil)
        #expect(spy.calls.isEmpty)
    }

    @Test func aPieceEventWithoutPiecesChangesNothing() {
        let spy = PieceReducerSpy(stub: (SessionState(phase: .recording), .createFolder))
        let sut = RecordingReducer(session: spy.reduce, status: readStatus)
        #expect(sut.reduce(makeBeginning(), .session(id: 1, .end)).0 == makeBeginning())
        #expect(sut.reduce(makeBeginning(), .session(id: 1, .end)).1 == nil)
        #expect(spy.calls.isEmpty)
    }

    @Test func endingWhileAPieceStartsKeepsItsWorkAndHoldsTheBringDown() {
        let stub = makePieces(.init(cannotRecord: "no track"))
        let spy = PieceReducerSpy(stub: (stub, .createFolder))
        let sut = RecordingReducer(session: spy.reduce, status: readStatus)
        let (next, effect) = sut.reduce(makeStarting(), .session(id: 1, .modelsChecked(missing: [])))
        #expect(next == makeState(makeStarting()) { $0.pieces = stub; $0.phase = .ending; $0.cannotRecord = "no track" })
        #expect(effect == .session(id: 1, .createFolder))
        #expect(spy.calls.map(\.event) == [.modelsChecked(missing: [])])
    }

    @Test func endingBringsThePiecesDownOnTheFirstResultThatStartsNothing() {
        let up = makePieces(.init())
        let spy = PieceReducerSpy(stub: (up, nil))
        let sut = RecordingReducer(session: spy.reduce, status: readStatus)
        let ending = makeState(makeStarting()) { $0.phase = .ending }
        _ = sut.reduce(ending, .session(id: 1, .folderFinished(error: nil)))
        #expect(spy.calls.map(\.event) == [.folderFinished(error: nil), .end])
        #expect(spy.calls.last?.state == up)
    }

    @Test func otherEventsDoNotCallTheSessionReducer() {
        let spy = PieceReducerSpy(stub: (SessionState(), nil))
        let sut = RecordingReducer(session: spy.reduce, status: readStatus)
        _ = sut.reduce(makeWithPieces(), .automaticChanged(false))
        #expect(spy.calls.isEmpty)
    }
}

private func makeWithPieces() -> RecordingState { makeState(makeRunning()) { $0.pieces = SessionState(phase: .bringingUp) } }

private final class PieceReducerSpy: @unchecked Sendable {
    struct Call: Equatable { let state: SessionState; let event: SessionEvent }
    private(set) var calls: [Call] = []
    private let stub: (SessionState, SessionEffect?)
    init(stub: (SessionState, SessionEffect?)) { self.stub = stub }
    func reduce(_ state: SessionState, _ event: SessionEvent) -> (SessionState, SessionEffect?) {
        calls.append(.init(state: state, event: event))
        return stub
    }
}
