import CallNames
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallNamesEffectHandlerTests {

    @Test func startDeliversTheBrowserReports() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(zoom: zoom, browser: browser)
        let (reducer, _) = makeSUT()
        let (_, effect) = reducer.reduce(makeState(), .start)
        await expect(sut, with: effect, toDeliver: .browserConnected(4), on: {
            browser.report(.browserConnected(4))
            browser.finish()
        })
        #expect(zoom.observations == 0 && browser.observations == 1)
        #expect(zoom.stops == 0 && browser.stops == 0)
    }

    @Test func firstRecordingOnDeliversZoomObservationsWithTheirInstants() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(zoom: zoom, browser: browser)
        let (reducer, _) = makeSUT()
        let state = makeState { $0.observation = .observing }
        let (_, effect) = reducer.reduce(state, .recordingChanged(isOn: true, at: 100))
        let report = CallNamesEvent.zoom(.observed, at: 101.5)
        await expect(sut, with: effect, toDeliver: report, on: {
            zoom.report(report)
            zoom.finish()
        })
        #expect(zoom.observations == 1 && browser.observations == 0)
        #expect(zoom.stops == 0 && browser.stops == 0)
    }

    @Test func stopObservingClosesEverySourceThenDeliversStopped() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(zoom: zoom, browser: browser)
        let (reducer, _) = makeSUT()
        let state = makeObservedState { $0.observation = .observing; $0.rowNames = [1: "Anna"] }
        let (_, effect) = reducer.reduce(state, .stop)
        await expect(sut, with: effect, toDeliver: .observationStopped, on: {})
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
    _ sut: CallNamesEffectHandler, with effect: CallNamesEffect?, toDeliver event: CallNamesEvent, on report: () -> Void
) async {
    guard let effect else { Issue.record("expected an observation effect"); return }
    let events = sut.handle(effect)
    report()
    var delivered: [CallNamesEvent] = []
    for await event in events { delivered.append(event) }
    #expect(delivered == [event])
}
