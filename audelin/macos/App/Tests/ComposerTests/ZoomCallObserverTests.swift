import CallNames
@testable import Composer
import Synchronization
import Testing
import ZoomAccessibility

@Suite(.timeLimit(.minutes(1)))
struct ZoomCallObserverTests {

    @Test func withoutPermissionNothingIsReadAndTheStreamEnds() async {
        let reads = Mutex(0)
        let sut = ZoomCallObserver(isPermitted: { false }, windows: { reads.withLock { $0 += 1 }; return [] },
                                   clock: { 1 }, sleep: { _ in })
        var events: [CallNamesEvent] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events.isEmpty)
        #expect(reads.withLock { $0 } == 0)
    }

    @Test func eachPollReportsItsChangesThenATickInCallTime() async {
        let readings = Mutex([meeting(talking: "Anna"), meeting(talking: "Boris"), []])
        let times = Mutex([2.0, 2.5, 3.0])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { readings.withLock { $0.next() } },
                                   clock: { times.withLock { $0.next() } }, sleep: { _ in })
        var events: [CallNamesEvent] = []
        for await event in sut.observe() {
            events.append(event)
            if event == .tick(now: 3) { break }
        }
        #expect(events == [
            .zoom(.started("Anna"), at: 2), .zoom(.observed, at: 2), .tick(now: 2),
            .zoom(.stopped("Anna"), at: 2.5), .zoom(.started("Boris"), at: 2.5), .zoom(.observed, at: 2.5), .tick(now: 2.5),
            .zoom(.stopped("Boris"), at: 3), .zoom(.lost, at: 3), .tick(now: 3),
        ])
    }

    @Test func beforeRecordingStartsAPollReportsNothing() async {
        let times = Mutex<[Double?]>([nil, 4])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { meeting(talking: nil) },
                                   clock: { times.withLock { $0.next() } }, sleep: { _ in })
        var events: [CallNamesEvent] = []
        for await event in sut.observe() {
            events.append(event)
            if case .tick = event { break }
        }
        #expect(events == [.zoom(.observed, at: 4), .tick(now: 4)])
    }

    @Test func stopEndsTheStreamWhileThePollWaits() async {
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { [] }, clock: { 1 },
                                   sleep: { _ in try await Task.sleep(for: .seconds(3600)) })
        var events: [CallNamesEvent] = []
        for await event in sut.observe() {
            events.append(event)
            await sut.stop()
        }
        #expect(events == [.tick(now: 1)])
    }

    @Test func pollsAreSpacedByTheInterval() async {
        let sleeps = Mutex<[Duration]>([])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { [] }, clock: { 1 },
                                   sleep: { duration in sleeps.withLock { $0.append(duration) }; throw CancellationError() })
        for await _ in sut.observe() {}
        #expect(sleeps.withLock { $0 } == [.milliseconds(500)])
    }
}

private func meeting(talking: String?) -> [Node] {
    [Node(role: "AXWindow", identifier: "zm.meeting.window.main",
          children: talking.map { [Node(role: "AXStaticText", value: "Talking: \($0)")] } ?? [])]
}

private extension Array {
    /// The next value; the last one repeats, since a poll may run again before stop lands.
    mutating func next() -> Element { count > 1 ? removeFirst() : self[0] }
}
