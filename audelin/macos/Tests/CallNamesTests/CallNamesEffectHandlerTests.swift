import CallNames
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallNamesEffectHandlerTests {

    @Test func startDeliversReportsInCallTimeFromBothSources() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(sources: [zoom, browser])
        let (reducer, _) = makeSUT()
        let (_, effect) = reducer.reduce(makeState(), .start)
        let zoomReport = CallNamesEvent.zoom(.observed, at: 1.5)
        let browserReport = CallNamesEvent.browser(.init(epoch: 4, sequence: 1, time: 2, kind: .heartbeat))
        await expect(sut, with: effect, toDeliver: [zoomReport, browserReport], on: {
            #expect(zoom.observations == 1 && browser.observations == 1)
            zoom.report(zoomReport); browser.report(browserReport)
            zoom.finish(); browser.finish()
        })
        #expect(zoom.stops == 0 && browser.stops == 0)
    }

    @Test func stopObservingClosesEverySourceThenDeliversStopped() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(sources: [zoom, browser])
        let (reducer, _) = makeSUT()
        let state = makeObservedState { $0.observation = .observing; $0.rowNames = [1: "Anna"] }
        let (_, effect) = reducer.reduce(state, .stop)
        await expect(sut, with: effect, toDeliver: [.observationStopped], on: {})
        #expect(zoom.stops == 1 && browser.stops == 1)
        #expect(zoom.observations == 0 && browser.observations == 0)
    }
}

private final class SourceSpy: CallAppObserver {
    private let stream: AsyncStream<CallNamesEvent>
    private let continuation: AsyncStream<CallNamesEvent>.Continuation
    private let counts = Mutex((observe: 0, stop: 0))

    init() { (stream, continuation) = AsyncStream.makeStream() }

    var stops: Int { counts.withLock { $0.stop } }
    var observations: Int { counts.withLock { $0.observe } }

    func observe() -> AsyncStream<CallNamesEvent> {
        counts.withLock { $0.observe += 1 }
        return stream
    }

    func stop() async { counts.withLock { $0.stop += 1 } }

    func report(_ event: CallNamesEvent) { continuation.yield(event) }
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
