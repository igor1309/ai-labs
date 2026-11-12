import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingDoerTests {

    @Test(arguments: [makeBeginning(), makeCall(), makeDeferredCall()])
    func beginningAsksReadinessBeforeBeginning(_ state: RecordingState) async {

        let (sut, spies) = makeSUT()
        sut.act(on: state)
        await spies.ready.waitForCall()
        #expect(await spies.session.beginIDs.isEmpty)
    }

    @Test(arguments: [makeBeginning(), makeCall(), makeDeferredCall()])
    func readyBeginningBeginsThatSessionAndSendsItsReport(_ state: RecordingState) async {

        let (sut, spies) = makeSUT()
        sut.act(on: state)
        await spies.ready.complete(with: true)
        await spies.session.completeBegin(with: .ready)
        #expect(await spies.sent.next() == .sessionReported(id: state.lastSessionID, .ready))
        #expect(await spies.session.beginIDs == [state.lastSessionID])
        #expect(await spies.session.endIDs.isEmpty)
    }

    @Test(arguments: [makeBeginning(), makeCall(), makeDeferredCall()])
    func beginningSeenTwiceAsksAndBeginsOnce(_ state: RecordingState) async {

        let (sut, spies) = makeSUT()
        sut.act(on: state)
        sut.act(on: state)
        await spies.ready.complete(with: true)
        await spies.session.completeBegin(with: .ready)
        #expect(await spies.sent.next() == .sessionReported(id: state.lastSessionID, .ready))
        #expect(await spies.ready.count == 1)
        #expect(await spies.session.beginIDs == [state.lastSessionID])
    }

    @Test(arguments: [makeBeginning(), makeState(makeDeferredCall()) { $0.missing = [.callAudioAccess] }])
    func unreadyBeginningReportsTheConditionAndEndsWithoutASession(_ state: RecordingState) async {

        let (sut, spies) = makeSUT()
        sut.act(on: state)
        await spies.ready.complete(with: false)
        #expect(await spies.sent.next() == .conditionChanged(.callAudioAccess, available: false))
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: state.lastSessionID, .ended))
        #expect(await spies.session.beginIDs.isEmpty)
        #expect(await spies.session.endIDs.isEmpty)
    }

    @Test func unreadyBeginningSeenTwiceReportsOnce() async {

        let (sut, spies) = makeSUT()
        sut.act(on: makeBeginning())
        sut.act(on: makeBeginning())
        await spies.ready.complete(with: false)
        #expect(await spies.sent.next() == .conditionChanged(.callAudioAccess, available: false))
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 1, .ended))
        #expect(await spies.ready.count == 1)
        #expect(await spies.released.count == 1)
        #expect(await spies.sent.count == 0)
    }

    @Test func endingWhileAwaitingReadinessReleasesWithoutASession() async {

        let (sut, spies) = makeSUT()
        sut.act(on: makeBeginning())
        await spies.ready.waitForCall()
        sut.act(on: makeEnding())
        await spies.ready.complete(with: true)
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 1, .ended))
        #expect(await spies.session.beginIDs.isEmpty)
        #expect(await spies.session.endIDs.isEmpty)
    }

    @Test func recordingForAnUnseenSessionBeginsIt() async {

        let (sut, spies) = makeSUT()
        sut.act(on: makeRunning(id: 4))
        await spies.ready.complete(with: true)
        await spies.session.completeBegin(with: .ready)
        #expect(await spies.sent.next() == .sessionReported(id: 4, .ready))
        #expect(await spies.session.beginIDs == [4])
        #expect(await spies.session.endIDs.isEmpty)
    }

    @Test func recordingForAnUnseenSessionSeenTwiceBeginsOnce() async {

        let (sut, spies) = makeSUT()
        sut.act(on: makeRunning(id: 4))
        sut.act(on: makeRunning(id: 4))
        await spies.ready.complete(with: true)
        await spies.session.completeBegin(with: .ready)
        #expect(await spies.sent.next() == .sessionReported(id: 4, .ready))
        #expect(await spies.session.beginIDs == [4])
    }

    @Test func endingForAnUnseenSessionBeginsAndEndsIt() async {

        let (sut, spies) = makeSUT()
        sut.act(on: makeEnding(id: 5))
        await spies.ready.complete(with: true)
        await spies.session.waitForEnd()
        await spies.session.completeBegin(with: .ended)
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 5, .ended))
        await spies.session.completeEnd()
        #expect(await spies.sent.next() == .sessionReported(id: 5, .ended))
        #expect(await spies.session.beginIDs == [5])
        #expect(await spies.session.endIDs == [5])
    }

    @Test func endingForAnUnseenSessionSeenTwiceBeginsAndEndsOnce() async {

        let (sut, spies) = makeSUT()
        sut.act(on: makeEnding(id: 5))
        sut.act(on: makeEnding(id: 5))
        await spies.ready.complete(with: true)
        await spies.session.waitForEnd()
        await spies.session.completeBegin(with: .ended)
        await spies.released.complete()
        await spies.session.completeEnd()
        #expect(await spies.sent.next() == .sessionReported(id: 5, .ended))
        #expect(await spies.sent.next() == .sessionReported(id: 5, .ended))
        #expect(await spies.session.beginIDs == [5])
        #expect(await spies.session.endIDs == [5])
        #expect(await spies.released.count == 1)
    }

    @Test func endingOfABegunSessionEndsIt() async {

        let (sut, spies) = await makeBegun()
        sut.act(on: makeEnding())
        await spies.session.completeEnd()
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 1, .ended))
        #expect(await spies.session.endIDs == [1])
    }

    @Test func endingSeenTwiceEndsOnce() async {

        let (sut, spies) = await makeBegun()
        sut.act(on: makeEnding())
        sut.act(on: makeEnding())
        await spies.session.completeEnd()
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 1, .ended))
        sut.act(on: makeEnding())
        #expect(await spies.session.endIDs == [1])
        #expect(await spies.released.count == 1)
    }

    @Test func aSecondSessionIsBegunAndEndedOnceAfterTheFirst() async {

        let (sut, spies) = await makeBegun()
        sut.act(on: makeEnding())
        await spies.session.completeEnd()
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 1, .ended))
        sut.act(on: makeBeginning(id: 2))
        sut.act(on: makeBeginning(id: 2))
        await spies.ready.complete(with: true)
        await spies.session.completeBegin(with: .cannotRecord("no mic"))
        #expect(await spies.sent.next() == .sessionReported(id: 2, .cannotRecord("no mic")))
        sut.act(on: makeEnding(id: 2))
        sut.act(on: makeEnding(id: 2))
        await spies.session.completeEnd()
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 2, .ended))
        #expect(await spies.session.beginIDs == [1, 2])
        #expect(await spies.session.endIDs == [1, 2])
        #expect(await spies.ready.count == 2)
    }

    @Test func endedIsSentOnlyAfterTheSessionEndsAndAudioIsReleased() async {

        let (sut, spies) = await makeBegun()
        sut.act(on: makeEnding())
        await spies.session.waitForEnd()
        #expect(await spies.released.count == 0)
        await spies.session.completeEnd()
        await spies.released.waitForCall()
        #expect(await spies.session.endReturned)
        #expect(await spies.sent.count == 0)
        await spies.released.complete()
        #expect(await spies.sent.next() == .sessionReported(id: 1, .ended))
    }

    @Test func aSessionGoneFromTheStateIsReleasedOnce() async {

        let (sut, spies) = await makeBegun()
        sut.act(on: makeIdleAfter(1))
        sut.act(on: makeIdleAfter(1))
        await spies.released.complete()
        #expect(await spies.released.count == 1)
        #expect(await spies.session.endIDs.isEmpty)
        #expect(await spies.sent.count == 0)
    }

    @Test(arguments: [makeIdle(), makeReserved(), makeQueued(.hand), makeQueued(.call)])
    func aStateWithNoSessionDoesNothing(_ state: RecordingState) async {

        let (sut, spies) = makeSUT()
        sut.act(on: state)
        sut.act(on: state)
        #expect(await spies.ready.count == 0)
        #expect(await spies.released.count == 0)
        #expect(await spies.session.beginIDs.isEmpty)
        #expect(await spies.sent.count == 0)
    }
}

private struct Spies {

    let session = SessionSpy()
    let sent = SendSpy()
    let ready = CallSpy<Bool>()
    let released = CallSpy<Void>()
}

private func makeSUT() -> (RecordingDoer, Spies) {

    let spies = Spies()
    let sut = RecordingDoer(session: spies.session,
                            callAudioReady: { [ready = spies.ready] in await ready.call() },
                            callAudioReleased: { [released = spies.released] in await released.call() },
                            send: { [sent = spies.sent] in await sent.send($0) })
    return (sut, spies)
}

/// A doer whose session 1 has begun and reported ready.
private func makeBegun() async -> (RecordingDoer, Spies) {

    let (sut, spies) = makeSUT()
    sut.act(on: makeBeginning())
    await spies.ready.complete(with: true)
    await spies.session.completeBegin(with: .ready)
    _ = await spies.sent.next()
    sut.act(on: makeRunning())
    return (sut, spies)
}
