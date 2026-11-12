import Recording
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingDoerTests {

    @Test(arguments: ["user", "call", "deferred"])
    func eachStartOriginAwaitsReadiness(_ origin: String) async {
        let ready = CallSpy<Bool>()
        let (sut, session, sent) = makeSUT(callAudioReady: { await ready.call() })
        var initial = RecordingState(automatic: true, missing: [])
        let start: RecordingState
        switch origin {
        case "user": start = RecordingReducer.reduce(initial, .userStart)
        case "call": start = RecordingReducer.reduce(initial, .callStarted)
        default:
            initial = state(.ending, id: 1)
            initial.automatic = true; initial.callOn = true; initial.pendingCall = true
            start = RecordingReducer.reduce(initial, .sessionReported(id: 1, .ended))
        }
        sut.act(on: start)
        await ready.waitForCall()
        #expect(await session.beginIDs.isEmpty)
        await ready.complete(with: true)
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: start.lastSessionID, .ready))
    }

    @Test func falseReadinessBlocksSessionReportsConditionAndReleases() async {
        let releases = AsyncStream<Void>.makeStream()
        let (sut, session, sent) = makeSUT(callAudioReady: { false }, callAudioReleased: { releases.continuation.yield(()) })
        sut.act(on: state(.beginning, id: 1))
        #expect(await sent.next() == .conditionChanged(.callAudioAccess, available: false))
        for await _ in releases.stream { break }
        #expect(await sent.next() == .sessionReported(id: 1, .ended))
        #expect(await session.beginIDs.isEmpty)
        #expect(await session.endIDs.isEmpty)
    }

    @Test func releaseFollowsSessionCleanup() async {
        let released = Mutex(false)
        let (sut, session, sent) = makeSUT(callAudioReleased: { released.withLock { $0 = true } })
        sut.act(on: state(.beginning, id: 1))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 1, .ready))
        sut.act(on: state(.ending, id: 1))
        await session.waitForEnd()
        #expect(!released.withLock { $0 })
        await session.completeEnd()
        #expect(await sent.next() == .sessionReported(id: 1, .ended))
        #expect(released.withLock { $0 })
    }

    @Test func stopWhileAwaitingReadinessReleasesWithoutBeginningSession() async {
        let ready = CallSpy<Bool>()
        let released = Mutex(false)
        let (sut, session, sent) = makeSUT(callAudioReady: { await ready.call() },
                                           callAudioReleased: { released.withLock { $0 = true } })
        sut.act(on: state(.beginning, id: 1))
        await ready.waitForCall()
        sut.act(on: state(.ending, id: 1))
        await ready.complete(with: true)
        #expect(await sent.next() == .sessionReported(id: 1, .ended))
        #expect(released.withLock { $0 })
        #expect(await session.beginIDs.isEmpty)
        #expect(await session.endIDs.isEmpty)
    }

    @Test func beginningStateBeginsThatSessionAndSendsItsReport() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: state(.beginning, id: 3))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 3, .ready))
        #expect(await session.beginIDs == [3])
        #expect(await session.endIDs == [])
    }

    @Test func sameBeginningStateSeenTwiceBeginsOnce() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: state(.beginning, id: 1))
        sut.act(on: state(.beginning, id: 1))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 1, .ready))
        sut.act(on: state(.recording, id: 1))
        sut.act(on: state(.beginning, id: 2))
        await session.completeBegin(with: .cannotRecord("no mic"))
        #expect(await sent.next() == .sessionReported(id: 2, .cannotRecord("no mic")))
        #expect(await session.beginIDs == [1, 2])
    }

    @Test func recordingStateForAnUnseenIDBeginsIt() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: state(.recording, id: 4))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 4, .ready))
        #expect(await session.beginIDs == [4])
        #expect(await session.endIDs == [])
    }

    @Test func endingStateForAnUnseenIDBeginsAndEndsIt() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: state(.ending, id: 5))
        await session.completeBegin(with: .ended)
        #expect(await sent.next() == .sessionReported(id: 5, .ended))
        await session.completeEnd()
        #expect(await sent.next() == .sessionReported(id: 5, .ended))
        #expect(await session.beginIDs == [5])
        #expect(await session.endIDs == [5])
    }

    @Test func endingStateAfterBeginEndsOnceHoweverOftenSeen() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: state(.beginning, id: 1))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 1, .ready))
        sut.act(on: state(.ending, id: 1))
        sut.act(on: state(.ending, id: 1))
        await session.completeEnd()
        #expect(await sent.next() == .sessionReported(id: 1, .ended))
        sut.act(on: state(.ending, id: 1))
        sut.act(on: state(.ending, id: 2))
        await session.completeBegin(with: .ended)
        await session.completeEnd()
        #expect([await sent.next(), await sent.next()] == [.sessionReported(id: 2, .ended), .sessionReported(id: 2, .ended)])
        #expect(await session.beginIDs == [1, 2])
        #expect(await session.endIDs == [1, 2])
    }

    @Test func endSendsEndedOnlyAfterTheSessionsEndReturns() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: state(.beginning, id: 1))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 1, .ready))
        sut.act(on: state(.ending, id: 1))
        await session.waitForEnd()
        #expect(await session.endReturned == false)
        await session.completeEnd()
        #expect(await sent.next() == .sessionReported(id: 1, .ended))
        #expect(await session.endReturned == true)
    }

    @Test func idleWithNoSessionDoesNothing() async {

        let (sut, session, sent) = makeSUT()
        sut.act(on: RecordingState(missing: []))
        sut.act(on: state(.beginning, id: 1))
        await session.completeBegin(with: .ready)
        #expect(await sent.next() == .sessionReported(id: 1, .ready))
        #expect(await session.beginIDs == [1])
        #expect(await session.endIDs == [])
        #expect(await sent.count == 0)
    }
}

private func makeSUT(callAudioReady: @escaping @Sendable () async -> Bool = { true },
                     callAudioReleased: @escaping @Sendable () async -> Void = {}) -> (RecordingDoer, SessionSpy, SendSpy) {

    let session = SessionSpy()
    let sent = SendSpy()
    return (RecordingDoer(session: session, callAudioReady: callAudioReady, callAudioReleased: callAudioReleased, send: { await sent.send($0) }), session, sent)
}

private func state(_ phase: RecordingState.Phase, id: UInt64) -> RecordingState {

    var state = RecordingState(missing: [])
    state.phase = phase
    state.session = .init(id: id, origin: .hand)
    state.lastSessionID = id
    return state
}
