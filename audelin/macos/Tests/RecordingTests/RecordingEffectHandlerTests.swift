import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingEffectHandlerTests {

    @Test func beginDeliversReady() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .beginSession(id: 1), toDeliver: .sessionReported(id: 1, .ready), on: {
            await spy.completeBegin(with: .ready)
        })
    }

    @Test func beginDeliversCannotRecord() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .beginSession(id: 1), toDeliver: .sessionReported(id: 1, .cannotRecord("no mic")), on: {
            await spy.completeBegin(with: .cannotRecord("no mic"))
        })
    }

    @Test func beginDeliversEnded() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .beginSession(id: 1), toDeliver: .sessionReported(id: 1, .ended), on: {
            await spy.completeBegin(with: .ended)
        })
    }

    @Test func beginPassesTheEffectsIDToTheSession() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .beginSession(id: 7), toDeliver: .sessionReported(id: 7, .ready), on: {
            await spy.completeBegin(with: .ready)
        })
        #expect(await spy.beginIDs == [7])
        #expect(await spy.endIDs == [])
    }

    @Test func endDeliversEndedOnlyOnceTheSessionHasEnded() async {

        let (sut, spy) = makeSUT()
        let delivered = Task {
            var events: [RecordingEvent] = []
            for await event in sut.handle(.endSession(id: 1)) { events.append(event) }
            return events
        }
        await spy.waitForEnd()
        #expect(await spy.endReturned == false)
        await spy.completeEnd()
        #expect(await delivered.value == [.sessionReported(id: 1, .ended)])
        #expect(await spy.endReturned == true)
    }

    @Test func endPassesTheEffectsIDToTheSession() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .endSession(id: 9), toDeliver: .sessionReported(id: 9, .ended), on: {
            await spy.completeEnd()
        })
        #expect(await spy.endIDs == [9])
        #expect(await spy.beginIDs == [])
    }

    @Test func streamFinishesAfterItsOneEvent() async {

        let (sut, spy) = makeSUT()
        let stream = sut.handle(.beginSession(id: 1))
        await spy.completeBegin(with: .ready)
        var iterator = stream.makeAsyncIterator()
        #expect(await iterator.next() == .sessionReported(id: 1, .ready))
        #expect(await iterator.next() == nil)
    }
}

private func makeSUT() -> (RecordingEffectHandler, SessionSpy) {

    let spy = SessionSpy()
    return (RecordingEffectHandler(session: spy), spy)
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
