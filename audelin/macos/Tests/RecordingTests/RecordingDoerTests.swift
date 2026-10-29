import Recording
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingDoerTests {

    @Test(arguments: ["user", "call", "deferred"])
    func eachStartOriginAwaitsReadiness(_ origin: String) async {
        let gate = AsyncStream<Bool>.makeStream()
        let asked = AsyncStream<Void>.makeStream()
        let (sut, session, sent) = makeSUT(callAudioReady: {
            asked.continuation.yield(())
            for await answer in gate.stream { return answer }
            return false
        })
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
        for await _ in asked.stream { break }
        #expect(await session.beginIDs.isEmpty)
        gate.continuation.yield(true)
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
        let gate = AsyncStream<Bool>.makeStream()
        let asked = AsyncStream<Void>.makeStream()
        let released = Mutex(false)
        let (sut, session, sent) = makeSUT(callAudioReady: {
            asked.continuation.yield(())
            for await answer in gate.stream { return answer }
            return false
        }, callAudioReleased: { released.withLock { $0 = true } })
        sut.act(on: state(.beginning, id: 1))
        for await _ in asked.stream { break }
        sut.act(on: state(.ending, id: 1))
        gate.continuation.yield(true)
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

/// Keeps each sent event until the test takes it; taking waits for one.
private actor SendSpy {

    private var events: [RecordingEvent] = []
    private let changed = AsyncStream<Void>.makeStream()

    var count: Int { events.count }

    func send(_ event: RecordingEvent) {

        events.append(event)
        changed.continuation.yield(())
    }

    func next() async -> RecordingEvent {

        while events.isEmpty {
            var iterator = changed.stream.makeAsyncIterator()
            guard await iterator.next() != nil else { return .sessionReported(id: 0, .ended) }
        }
        return events.removeFirst()
    }
}

/// Holds each call until the test completes it; completing waits for the call.
private actor SessionSpy: RecordingSession {

    private(set) var beginIDs: [UInt64] = []
    private(set) var endIDs: [UInt64] = []
    private(set) var endReturned = false
    private var pendingBegins: [AsyncStream<RecordingSessionReport>.Continuation] = []
    private var pendingEnds: [AsyncStream<Void>.Continuation] = []
    private let changed = AsyncStream<Void>.makeStream()

    func begin(id: UInt64) async -> RecordingSessionReport {

        beginIDs.append(id)
        let (stream, continuation) = AsyncStream<RecordingSessionReport>.makeStream()
        pendingBegins.append(continuation)
        wakeWaiters()
        for await report in stream { return report }
        return .ended
    }

    func end(id: UInt64) async {

        endIDs.append(id)
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        pendingEnds.append(continuation)
        wakeWaiters()
        for await _ in stream { break }
        endReturned = true
    }

    func completeBegin(with report: RecordingSessionReport) async {

        while pendingBegins.isEmpty {
            var iterator = changed.stream.makeAsyncIterator()
            guard await iterator.next() != nil else { return }
        }
        let continuation = pendingBegins.removeFirst()
        continuation.yield(report)
        continuation.finish()
    }

    func waitForEnd() async {

        while pendingEnds.isEmpty {
            var iterator = changed.stream.makeAsyncIterator()
            guard await iterator.next() != nil else { return }
        }
    }

    func completeEnd() async {

        await waitForEnd()
        guard !pendingEnds.isEmpty else { return }
        let continuation = pendingEnds.removeFirst()
        continuation.yield(())
        continuation.finish()
    }

    private func wakeWaiters() {

        changed.continuation.yield(())
    }
}
