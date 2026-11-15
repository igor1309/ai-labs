import Recording
import Testing

/// One session's work runs one piece at a time: get call audio, begin, end, release.
@Suite(.timeLimit(.minutes(1)))
struct RecordingStageTests {

    @Test func aStartPreparesCallAudio() {
        let start = makeIdle()
        assert(start, .userStart) { $0.phase = .beginning; $0.stage = .preparing; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 }
        assert(start, .userStart, delivers: .prepareCallAudio(id: 1))
    }

    @Test func preparedCallAudioBeginsTheSession() {
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: true)) { $0.stage = .beginning }
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: true), delivers: .begin(id: 1))
    }

    @Test func callAudioNotReadyIsMissingAndReleased() {
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: false)) { $0.missing = [.callAudioAccess]; $0.stage = .releasing }
        assert(makeBeginning(), .callAudioPrepared(id: 1, ready: false), delivers: .releaseCallAudio(id: 1))
    }

    @Test func aStopDuringPreparationSkipsBeginAndReleases() {
        let stopping = makeState(makeBeginning()) { $0.phase = .ending }
        assert(stopping, .callAudioPrepared(id: 1, ready: true)) { $0.stage = .releasing }
        assert(stopping, .callAudioPrepared(id: 1, ready: true), delivers: .releaseCallAudio(id: 1))
    }

    @Test func aStopDuringPreparationWaitsForIt() {
        assert(makeBeginning(), .userStop) { $0.phase = .ending }
        assert(makeBeginning(), .userStop, delivers: nil)
    }

    @Test func anAcceptedBeginWaitsForTheSession() {
        let beginning = makeState(makeBeginning()) { $0.stage = .beginning }
        assert(beginning, .sessionAccepted(id: 1)) { $0.stage = .begun }
        assert(beginning, .sessionAccepted(id: 1), delivers: nil)
    }

    @Test func aStopDuringBeginEndsOnceAccepted() {
        let stopping = makeState(makeBeginning()) { $0.stage = .beginning; $0.phase = .ending }
        assert(stopping, .sessionAccepted(id: 1)) { $0.stage = .ending }
        assert(stopping, .sessionAccepted(id: 1), delivers: .end(id: 1))
    }

    @Test func aStopWhileRecordingEndsTheSession() {
        assert(makeRunning(), .userStop) { $0.phase = .ending; $0.stage = .ending }
        assert(makeRunning(), .userStop, delivers: .end(id: 1))
    }

    @Test func aFinishedSessionReleasesCallAudio() {
        assert(makeEnding(), .sessionFinished(id: 1)) { $0.stage = .releasing }
        assert(makeEnding(), .sessionFinished(id: 1), delivers: .releaseCallAudio(id: 1))
    }

    @Test func aSessionEndingByItselfReleasesCallAudio() {
        assert(makeRunning(), .sessionFinished(id: 1)) { $0.stage = .releasing }
        assert(makeRunning(), .sessionFinished(id: 1), delivers: .releaseCallAudio(id: 1))
    }

    @Test func releasedCallAudioEndsTheSession() {
        assert(makeReleasing(), .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.session = nil }
        assert(makeReleasing(), .sessionReported(id: 1, .ended), delivers: nil)
    }

    @Test func theNextSessionPreparesOnlyAfterRelease() {
        let waiting = makeState(makeReleasing()) { $0.callOn = true; $0.pendingCall = true }
        assert(waiting, .callAudioPrepared(id: 2, ready: true))
        assert(waiting, .sessionReported(id: 1, .ended)) {
            $0.phase = .beginning; $0.stage = .preparing; $0.pendingCall = false
            $0.lastSessionID = 2; $0.session = .init(id: 2, origin: .call); $0.sessionBeganDuringCall = true
        }
        assert(waiting, .sessionReported(id: 1, .ended), delivers: .prepareCallAudio(id: 2))
    }

    @Test func storageIsNotReservedWhileReleasing() {
        assert(makeReleasing(), .reserveStorage(request: 1)) { $0.reservations = [1: false] }
        assert(makeReleasing(), .reserveStorage(request: 1), delivers: nil)
    }

    @Test func shutdownSettlesOnlyOnceCallAudioIsReleased() {
        let releasing = makeState(makeReleasing()) { $0.shutdown = .requested }
        assert(releasing, .sessionFinished(id: 1))
        assert(releasing, .sessionReported(id: 1, .ended)) { $0.phase = .idle; $0.stage = nil; $0.session = nil; $0.shutdown = .settled }
        assert(releasing, .sessionReported(id: 1, .ended), delivers: nil)
    }

    @Test(arguments: [
        RecordingEvent.sessionFinished(id: 1), .sessionAccepted(id: 1), .callAudioPrepared(id: 1, ready: true),
    ])
    func aRepeatedResultWhileReleasingIsIgnored(_ event: RecordingEvent) {
        assert(makeReleasing(), event)
        assert(makeReleasing(), event, delivers: nil)
    }

    @Test(arguments: [
        RecordingEvent.sessionFinished(id: 9), .sessionAccepted(id: 9), .callAudioPrepared(id: 9, ready: true),
    ])
    func anotherSessionsResultIsIgnored(_ event: RecordingEvent) {
        assert(makeRunning(), event)
        assert(makeRunning(), event, delivers: nil)
    }

    @Test(arguments: [
        RecordingEvent.sessionFinished(id: 1), .sessionAccepted(id: 1), .callAudioPrepared(id: 1, ready: true),
    ])
    func aResultAfterTheSessionIsIgnored(_ event: RecordingEvent) {
        assert(makeIdleAfter(1), event)
        assert(makeIdleAfter(1), event, delivers: nil)
    }
}

/// Each effect reaches exactly its collaborator and answers with the event it ends in.
@Suite(.timeLimit(.minutes(1)))
struct RecordingEffectHandlerTests {

    @Test(arguments: [true, false])
    func preparingAnswersWhetherCallAudioIsReady(_ ready: Bool) async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.prepareCallAudio(id: 3))
        await spies.prepare.complete(with: ready)
        #expect(await event == .callAudioPrepared(id: 3, ready: ready))
        #expect(await spies.session.beginIDs.isEmpty)
    }

    @Test func beginAnswersOnceTheSessionAccepts() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.begin(id: 3))
        await spies.session.completeBegin()
        #expect(await event == .sessionAccepted(id: 3))
        #expect(await spies.session.beginIDs == [3])
    }

    @Test func endAnswersOnceTheSessionFinished() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.end(id: 3))
        await spies.session.completeEnd()
        #expect(await event == .sessionFinished(id: 3))
        #expect(await spies.session.endIDs == [3])
    }

    @Test func releaseAnswersThatTheSessionEnded() async {
        let (sut, spies) = makeHandler()
        async let event = sut.handle(.releaseCallAudio(id: 3))
        await spies.release.complete()
        #expect(await event == .sessionReported(id: 3, .ended))
        #expect(await spies.release.count == 1)
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
    let session = SessionSpy()
    let prepare = CallSpy<Bool>()
    let release = CallSpy<Void>()
    let piece = CallSpy<SessionEvent>()
    let pieceCalls = PieceCalls()
}

actor PieceCalls {
    struct Call: Equatable { let id: UInt64; let effect: SessionEffect }
    private(set) var calls: [Call] = []
    func record(_ id: UInt64, _ effect: SessionEffect) { calls.append(.init(id: id, effect: effect)) }
}

private func makeHandler() -> (RecordingEffectHandler, HandlerSpies) {
    let spies = HandlerSpies()
    let sut = RecordingEffectHandler(session: spies.session,
                                     prepareCallAudio: { [prepare = spies.prepare] in await prepare.call() },
                                     releaseCallAudio: { [release = spies.release] in await release.call() },
                                     runPiece: { [piece = spies.piece, calls = spies.pieceCalls] id, effect in
                                         await calls.record(id, effect)
                                         return await piece.call()
                                     })
    return (sut, spies)
}

private func makeReleasing() -> RecordingState { makeState(makeEnding()) { $0.stage = .releasing } }

/// The current session's pieces advance through the injected Session reducer.
@Suite(.timeLimit(.minutes(1)))
struct RecordingPiecesTests {

    @Test func aPieceEventForTheCurrentSessionAdvancesItsPieces() {
        let spy = PieceReducerSpy(stub: (SessionState(phase: .recording), .createFolder))
        let sut = RecordingReducer(session: spy.reduce)
        let state = makeWithPieces()
        let event = RecordingEvent.session(id: 1, .modelsChecked(missing: []))
        let (next, effect) = sut.reduce(state, event)
        #expect(next == makeState(state) { $0.pieces = SessionState(phase: .recording) })
        #expect(effect == .session(id: 1, .createFolder))
        #expect(spy.calls == [.init(state: SessionState(phase: .bringingUp), event: .modelsChecked(missing: []))])
    }

    @Test func aPieceEventForAnotherSessionChangesNothing() {
        let spy = PieceReducerSpy(stub: (SessionState(phase: .recording), .createFolder))
        let sut = RecordingReducer(session: spy.reduce)
        let state = makeWithPieces()
        #expect(sut.reduce(state, .session(id: 2, .end)).0 == state)
        #expect(sut.reduce(state, .session(id: 2, .end)).1 == nil)
        #expect(spy.calls.isEmpty)
    }

    @Test func aPieceEventWithoutPiecesChangesNothing() {
        let spy = PieceReducerSpy(stub: (SessionState(phase: .recording), .createFolder))
        let sut = RecordingReducer(session: spy.reduce)
        #expect(sut.reduce(makeRunning(), .session(id: 1, .end)).0 == makeRunning())
        #expect(sut.reduce(makeRunning(), .session(id: 1, .end)).1 == nil)
        #expect(spy.calls.isEmpty)
    }

    @Test func otherEventsDoNotCallTheSessionReducer() {
        let spy = PieceReducerSpy(stub: (SessionState(), nil))
        let sut = RecordingReducer(session: spy.reduce)
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
