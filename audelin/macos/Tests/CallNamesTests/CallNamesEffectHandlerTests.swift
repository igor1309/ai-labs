import CallNames
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallNamesEffectHandlerTests {

    @Test func observeDeliversWhatEverySourceReportsUntilAllFinish() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(sources: [zoom, browser])
        let events = sut.handle(.observe)
        zoom.report(.zoom(.observed, at: 1))
        browser.report(.browserConnected(4))
        zoom.finish(); browser.finish()
        var delivered: [CallNamesEvent] = []
        for await event in events { delivered.append(event) }
        #expect(delivered.count == 2)
        #expect(delivered.contains(.zoom(.observed, at: 1)))
        #expect(delivered.contains(.browserConnected(4)))
        #expect(zoom.stops == 0 && browser.stops == 0)
    }

    @Test func stopObservingClosesEverySourceThenDeliversStopped() async {
        let zoom = SourceSpy(), browser = SourceSpy()
        let sut = CallNamesEffectHandler(sources: [zoom, browser])
        var delivered: [CallNamesEvent] = []
        for await event in sut.handle(.stopObserving) { delivered.append(event) }
        #expect(delivered == [.observationStopped])
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
