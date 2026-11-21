import CallNames
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallNamesEffectHandlerTests {

    @Test func startDeliversReportsInCallTimeFromBothSources() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler()
        let watch = CallAppWatch(sources: [zoom, browser])
        let (reducer, _) = makeSUT()
        let (_, effect) = reducer.reduce(.init(), .start(1, watch))
        let zoomReport = CallNamesUpdate.zoom(.observed, at: 1.5)
        let browserReport = CallNamesUpdate.browser(.init(epoch: 4, sequence: 1, time: 2, kind: .heartbeat))
        await expect(sut, with: effect, toDeliver: [.update(1, zoomReport), .update(1, browserReport)], on: {
            #expect(zoom.observations == 1 && browser.observations == 1)
            zoom.report(zoomReport); browser.report(browserReport)
            zoom.finish(); browser.finish()
        })
        #expect(zoom.stops == 0 && browser.stops == 0)
    }

    @Test func stopObservingClosesEverySourceThenDeliversStopped() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler()
        let watch = CallAppWatch(sources: [zoom, browser])
        let (reducer, _) = makeSUT()
        let state = makeModel(makeObservedState { $0.observation = .observing; $0.rowNames = [1: "Anna"] }, watch: watch)
        let (_, effect) = reducer.reduce(state, .stop(1))
        await expect(sut, with: effect, toDeliver: [.observationStopped(1)], on: {})
        #expect(zoom.stops == 1 && browser.stops == 1)
        #expect(zoom.observations == 0 && browser.observations == 0)
    }
    @Test func stoppingOneWatchLeavesReportsFromTheOther() async throws {
        let first = SourceSpy(), second = SourceSpy()
        let firstWatch = CallAppWatch(sources: [first]), secondWatch = CallAppWatch(sources: [second])
        let sut = CallNamesEffectHandler()
        let (reducer, _) = makeSUT()
        let (firstState, firstEffect) = reducer.reduce(.init(), .start(1, firstWatch))
        let (both, secondEffect) = reducer.reduce(firstState, .start(2, secondWatch))
        let firstReports = sut.handle(try #require(firstEffect))
        let secondReports = sut.handle(try #require(secondEffect))
        defer { first.finish(); second.finish() }

        let (stopping, stop) = reducer.reduce(both, .stop(1))
        var stopped = sut.handle(try #require(stop)).makeAsyncIterator()
        let acknowledgement = try #require(await stopped.next())
        #expect(acknowledgement == .observationStopped(1))
        let (state, _) = reducer.reduce(stopping, acknowledgement)
        #expect(state.calls[1]?.names.observation == .stopped)
        #expect(state.calls[2]?.names.observation == .observing)
        var firstEvents = firstReports.makeAsyncIterator()
        #expect(await firstEvents.next() == nil)

        let report = CallNamesUpdate.zoom(.started("Boris"), at: 1)
        second.report(report)
        var secondEvents = secondReports.makeAsyncIterator()
        #expect(await secondEvents.next() == .update(2, report))
        #expect(first.stops == 1 && second.stops == 0)
    }

}

private final class SourceSpy: CallAppObserver {
    private let stream: AsyncStream<CallNamesUpdate>
    private let continuation: AsyncStream<CallNamesUpdate>.Continuation
    private let counts = Mutex((observe: 0, stop: 0))

    init() { (stream, continuation) = AsyncStream.makeStream() }

    var stops: Int { counts.withLock { $0.stop } }
    var observations: Int { counts.withLock { $0.observe } }

    func observe() -> AsyncStream<CallNamesUpdate> {
        counts.withLock { $0.observe += 1 }
        return stream
    }

    func stop() async {
        counts.withLock { $0.stop += 1 }
        finish()
    }

    func report(_ event: CallNamesUpdate) { continuation.yield(event) }
    func finish() { continuation.finish() }
}

private func expect(
    _ sut: CallNamesEffectHandler, with effect: CallNamesEffect?, toDeliver expected: [CallNamesEvent], on report: () -> Void
) async {
    guard let effect else { Issue.record("expected an observation effect"); return }
    let events = sut.handle(effect)
    report()
    var delivered: [CallNamesEvent] = []
    for await event in events { delivered.append(event) }
    #expect(delivered.count == expected.count)
    for event in expected { #expect(delivered.contains(event)) }
}
