import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingDoerTests {

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

private func makeSUT() -> (RecordingDoer, SessionSpy, SendSpy) {

    let session = SessionSpy()
    let sent = SendSpy()
    return (RecordingDoer(session: session, send: { await sent.send($0) }), session, sent)
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
    private var waiters: [CheckedContinuation<Void, Never>] = []

    var count: Int { events.count }

    func send(_ event: RecordingEvent) {

        events.append(event)
        for waiter in waiters { waiter.resume() }
        waiters.removeAll()
    }

    func next() async -> RecordingEvent {

        while events.isEmpty { await withCheckedContinuation { waiters.append($0) } }
        return events.removeFirst()
    }
}

/// Holds each call until the test completes it; completing waits for the call.
private actor SessionSpy: RecordingSession {

    private(set) var beginIDs: [UInt64] = []
    private(set) var endIDs: [UInt64] = []
    private(set) var endReturned = false
    private var pendingBegins: [CheckedContinuation<RecordingSessionReport, Never>] = []
    private var pendingEnds: [CheckedContinuation<Void, Never>] = []
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func begin(id: UInt64) async -> RecordingSessionReport {

        beginIDs.append(id)
        return await withCheckedContinuation { continuation in
            pendingBegins.append(continuation)
            wakeWaiters()
        }
    }

    func end(id: UInt64) async {

        endIDs.append(id)
        await withCheckedContinuation { continuation in
            pendingEnds.append(continuation)
            wakeWaiters()
        }
        endReturned = true
    }

    func completeBegin(with report: RecordingSessionReport) async {

        while pendingBegins.isEmpty { await withCheckedContinuation { waiters.append($0) } }
        pendingBegins.removeFirst().resume(returning: report)
    }

    func waitForEnd() async {

        while pendingEnds.isEmpty { await withCheckedContinuation { waiters.append($0) } }
    }

    func completeEnd() async {

        await waitForEnd()
        pendingEnds.removeFirst().resume()
    }

    private func wakeWaiters() {

        for waiter in waiters { waiter.resume() }
        waiters.removeAll()
    }
}
