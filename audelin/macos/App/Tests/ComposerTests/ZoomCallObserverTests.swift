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
                                   now: { 1 }, sleep: { _ in await Task.yield() }, knownName: { nil }, rememberName: { _ in })
        var events: [CallNamesUpdate] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events.isEmpty)
        #expect(reads.withLock { $0 } == 0)
    }

    @Test func eachPollReportsItsReadingAndTickAtTheSameMonotonicInstant() async {
        let readings = Mutex([meeting(talking: "Anna"), meeting(talking: "Anna"), meeting(talking: nil), []])
        let times = Mutex([102.0, 102.5, 103.0, 103.5])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { readings.withLock { $0.removeFirst() } },
                                   now: { times.withLock { $0.removeFirst() } }, sleep: { _ in
                                       if times.withLock({ $0.isEmpty }) { throw CancellationError() }
                                   }, knownName: { nil }, rememberName: { _ in })
        var events: [CallNamesUpdate] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events == [
            .zoom(.speaker("Anna"), at: 102), .tick(now: 102),
            .zoom(.speaker("Anna"), at: 102.5), .tick(now: 102.5),
            .zoom(.nobody, at: 103), .tick(now: 103),
            .zoom(.unavailable, at: 103.5), .tick(now: 103.5),
        ])
    }

    @Test func stopEndsTheStreamWhileThePollWaits() async {
        let sleeping = AsyncStream<Void>.makeStream()
        let resume = AsyncStream<Void>.makeStream()
        defer { sleeping.continuation.finish(); resume.continuation.finish() }
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { [] }, now: { 1 }, sleep: { _ in
            sleeping.continuation.yield()
            for await _ in resume.stream {}
        }, knownName: { nil }, rememberName: { _ in })
        var events = sut.observe().makeAsyncIterator()
        var waits = sleeping.stream.makeAsyncIterator()
        await waits.next()
        await sut.stop()
        #expect(await events.next() == .zoom(.unavailable, at: 1))
        #expect(await events.next() == .tick(now: 1))
        #expect(await events.next() == nil)
    }

    @Test func pollsAreSpacedByTheInterval() async {
        let sleeps = Mutex<[Duration]>([])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { [] }, now: { 1 },
                                   sleep: { duration in sleeps.withLock { $0.append(duration) }; throw CancellationError() },
                                   knownName: { nil }, rememberName: { _ in })
        for await _ in sut.observe() {}
        #expect(sleeps.withLock { $0 } == [.milliseconds(500)])
    }

    @Test func aNameZoomShowsIsRememberedOnceAndNamesTheOtherTileLater() async {
        let readings = Mutex([gallery(["Me"], account: "Me"), gallery(["Me"], account: "Me"), gallery(["Me", "Anna"], account: nil)])
        let times = Mutex([1.0, 2.0, 3.0])
        let remembered = Mutex<[String]>([])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { readings.withLock { $0.removeFirst() } },
                                   now: { times.withLock { $0.removeFirst() } }, sleep: { _ in
                                       if times.withLock({ $0.isEmpty }) { throw CancellationError() }
                                   },
                                   knownName: { nil }, rememberName: { name in remembered.withLock { $0.append(name) } })
        var events: [CallNamesUpdate] = []
        for await event in sut.observe() { events.append(event) }
        #expect(remembered.withLock { $0 } == ["Me"])
        #expect(events.contains(.zoom(.speaker("Anna"), at: 3)))
    }

    @Test func aRememberedNameNamesTheOtherTileFromTheFirstPoll() async {
        let remembered = Mutex<[String]>([])
        let sut = ZoomCallObserver(isPermitted: { true }, windows: { gallery(["Me", "Anna"], account: nil) }, now: { 1 },
                                   sleep: { _ in throw CancellationError() },
                                   knownName: { "Me" }, rememberName: { name in remembered.withLock { $0.append(name) } })
        var events: [CallNamesUpdate] = []
        for await event in sut.observe() { events.append(event) }
        #expect(events == [.zoom(.speaker("Anna"), at: 1), .tick(now: 1)])
        #expect(remembered.withLock { $0 }.isEmpty)
    }
}

private func gallery(_ names: [String], account: String?) -> [Node] {
    let tiles = names.map { Node(role: "AXTabGroup", description: "\($0), Computer audio unmuted, Video off") }
    let workplace = account.map { [Node(role: "AXWindow", title: "Zoom Workplace", children: [
        Node(role: "AXButton", description: "Zoom, \($0), In a Zoom Meeting, Basic account"),
    ])] } ?? []
    return [Node(role: "AXWindow", identifier: "zm.meeting.window.main", children: tiles)] + workplace
}

private func meeting(talking: String?) -> [Node] {
    [Node(role: "AXWindow", identifier: "zm.meeting.window.main",
          children: talking.map { [Node(role: "AXStaticText", value: "Talking: \($0)")] } ?? [])]
}
