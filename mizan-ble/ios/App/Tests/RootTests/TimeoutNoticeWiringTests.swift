import Foundation
import Testing
import HostBroadcast
import HostUI
import TimeoutNotice
@testable import Root

@Suite @MainActor struct TimeoutNoticeWiringTests {
    @Test func noticeEndsThirtySecondsAfterTheTimeout() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        try await timeOut(h, host)
        #expect(host.notice?.state.showing == .init(number: 1))
        #expect(h.clock.countdownRequests == [
            .init(count: 60, interval: .seconds(1)),
            .init(count: 30, interval: .seconds(1)),
        ])
        h.clock.advance(29)
        await until { host.screen.status == "Timed out" && h.clock.running == 1 }
        h.clock.advance(1)
        await until { host.notice?.state.showing == nil }
        #expect(host.screen.status == "Idle")
        #expect(host.screen.notice == nil)
        #expect(host.screen.buttons.map(\.event) == [.lockAndBroadcast])
        // Host broadcast is not told: it stays timed out until the next lock.
        #expect(host.broadcast?.state.phase == .timedOut)
        #expect(h.clock.running == 0)
        #expect(noticeLog(h) == ["hidden", "showing attempt=1", "hidden"])
    }

    @Test func anActionEndsTheNoticeAndStillTakesEffect() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        try await timeOut(h, host)
        host.event(.digit(5))
        await until { host.notice?.state.showing == nil && host.screen.amount == "5" }
        #expect(host.screen.status == "Idle")
        #expect(host.screen.buttons.map(\.event) == [.lockAndBroadcast])
        #expect(host.screen.buttons[0].isEnabled)
        // The stopped wait is gone, so its thirty seconds cannot end anything later.
        #expect(h.clock.running == 0)
        h.clock.advance(30)
        #expect(host.screen.amount == "5")
        #expect(noticeLog(h) == ["hidden", "showing attempt=1", "hidden"])
    }

    @Test func aLaterBroadcastAndItsTimeoutKeepTheirOwnClock() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        try await timeOut(h, host)
        host.event(.digit(7))
        await until { host.screen.amount == "7" && host.notice?.state.showing == nil }
        host.event(.lockAndBroadcast)
        let second = try await onAir(h, host, after: 1)
        await until { h.clock.starts == [60, 30, 60] }
        h.clock.advance(30)
        await until { host.broadcast?.state.secondsLeft == 30 }
        #expect(host.screen.status == "Advertising")
        #expect(host.broadcast?.state.attempt == .init(number: 2))
        h.clock.advance(30)
        await until { host.notice?.state.showing == .init(number: 2) && host.screen.status == "Timed out" }
        await until { h.host.calls.contains(.retire(second)) }
        #expect(h.clock.countdownRequests == [
            .init(count: 60, interval: .seconds(1)),
            .init(count: 30, interval: .seconds(1)),
            .init(count: 60, interval: .seconds(1)),
            .init(count: 30, interval: .seconds(1)),
        ])
        h.clock.advance(30)
        await until { host.notice?.state.showing == nil }
        #expect(host.screen.status == "Idle")
        #expect(noticeLog(h) == ["hidden", "showing attempt=1", "hidden", "showing attempt=2", "hidden"])
    }

    @Test func anActionQueuedRightAfterTheTimeoutHidesItsNotice() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        _ = try await advertise(h, host)
        h.clock.advance(60)
        await until { host.broadcast?.state.phase == .timedOut }
        // No wait between the timeout's reduction and the operator's action.
        host.event(.delete)
        await until { host.notice?.state.newest == .init(number: 1) && host.notice?.state.showing == nil }
        #expect(noticeLog(h) == ["hidden", "showing attempt=1", "hidden"])
        #expect(host.screen.status == "Idle")
        #expect(h.clock.running == 0)
    }

    @Test func aNewHostModeStartsWithNoNoticeAndStopsTheOldWait() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        try await timeOut(h, host)
        #expect(h.clock.running == 1)
        root.choose(.client)
        #expect(host.notice == nil)
        root.choose(.host)
        let next = try #require(root.host)
        #expect(next.notice?.state == TimeoutNotice.State())
        #expect(next.screen.status != "Timed out")
        await until { h.clock.running == 0 }
    }

    @Test func noticeTimersEndOnlyAtZeroAndOnlyTheirOwnNotice() async {
        let clock = ClockSpy()
        defer { clock.finish() }
        let timer = NoticeTimer(clock: clock)
        let sent = Recorded<TimeoutNotice.Event>()
        timer.send = { sent.values.append($0) }
        let (older, newer) = (TimeoutNotice.Notice(number: 3), TimeoutNotice.Notice(number: 4))
        timer.start(seconds: 30, for: older)
        timer.start(seconds: 30, for: newer)
        #expect(clock.countdownRequests == [
            .init(count: 30, interval: .seconds(1)),
            .init(count: 30, interval: .seconds(1)),
        ])
        timer.stop(older)
        await until { clock.running == 1 }
        clock.advance(29)
        clock.advance(1)
        await until { sent.values == [.elapsed(newer)] }
        #expect(clock.running == 0)

        timer.start(seconds: 30, for: older)
        #expect(clock.countdownRequests == Array(repeating: .init(count: 30, interval: .seconds(1)), count: 3))
        timer.stop(older)
        await until { clock.running == 0 }
        clock.advance(30)
        #expect(sent.values == [.elapsed(newer)])
    }

    @Test func aPositiveTickIsProcessedWithoutEndingTheNoticeBeforeZero() async {
        let (events, sink) = AsyncStream<NoticeTimerEvent>.makeStream()
        let clock = PositiveTickClock(events: sink)
        let timer = NoticeTimer(clock: clock)
        defer { timer.stop(); sink.finish() }
        let sent = Recorded<TimeoutNotice.Event>()
        timer.send = {
            sent.values.append($0)
            sink.yield(.sent($0))
        }
        let notice = TimeoutNotice.Notice(number: 3)
        var iterator = events.makeAsyncIterator()

        timer.start(seconds: 30, for: notice)
        #expect(await iterator.next() == .requestedNext)
        #expect(sent.values.isEmpty)

        await clock.supplyZero()
        #expect(await iterator.next() == .sent(.elapsed(notice)))
        #expect(sent.values == [.elapsed(notice)])
        await clock.finish()
    }

    @Test func stoppingANoticeTimerLeavesTheBroadcastCountdownRunning() async {
        let clock = ClockSpy()
        defer { clock.finish() }
        let h = Harness()
        let bindings = HostBindings(radio: h.host, clock: clock, settings: .init(store: h.store), log: h.log)
        let seconds = Recorded<Int>()
        bindings.send = { if case .secondsLeft(_, let left) = $0 { seconds.values.append(left) } }
        let timer = NoticeTimer(clock: clock)
        bindings.start(seconds: 60, for: .init(number: 4))
        timer.start(seconds: 30, for: .init(number: 3))
        #expect(clock.countdownRequests == [
            .init(count: 60, interval: .seconds(1)),
            .init(count: 30, interval: .seconds(1)),
        ])
        timer.stop(.init(number: 3))
        timer.stop()
        await until { clock.running == 1 }
        clock.advance(1)
        await until { seconds.values == [59] }
        bindings.stop()
    }

    private func advertise(_ h: Harness, _ host: HostMode) async throws -> UUID {
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        host.event(.digit(1))
        await until { host.screen.amount == "1" }
        host.event(.lockAndBroadcast)
        return try await onAir(h, host, after: 0)
    }

    private func onAir(_ h: Harness, _ host: HostMode, after served: Int) async throws -> UUID {
        await until { h.host.calls.compactMap(\.served).count == served + 1 }
        let id = try #require(h.host.calls.compactMap(\.served).last)
        h.host.continuation.yield(.onAir(session: id))
        await until { host.broadcast?.state.phase == .advertising }
        return id
    }

    private func timeOut(_ h: Harness, _ host: HostMode) async throws {
        let id = try await advertise(h, host)
        h.clock.advance(60)
        await until { host.screen.status == "Timed out" && host.amount?.state.amount == "" }
        await until { h.host.calls.contains(.retire(id)) }
        #expect(host.screen.notice?.title == "No client in 60 s")
    }

    private func noticeLog(_ h: Harness) -> [String] {
        h.log.entries.filter { $0.category == .timeoutNotice }.map(\.message)
    }
}

@MainActor @Observable private final class Recorded<Value> {
    var values: [Value] = []
}

private enum NoticeTimerEvent: Equatable {
    case requestedNext
    case sent(TimeoutNotice.Event)
}

private actor PositiveTickClock: ClockPort {
    private let events: AsyncStream<NoticeTimerEvent>.Continuation
    private var deliveredPositive = false
    private var finished = false
    private var pending: CheckedContinuation<Int?, Never>?

    init(events: AsyncStream<NoticeTimerEvent>.Continuation) { self.events = events }

    nonisolated func countdown(from count: Int, every interval: Duration) -> AsyncStream<Int> {
        AsyncStream(unfolding: { await self.next() })
    }

    private func next() async -> Int? {
        if !deliveredPositive {
            deliveredPositive = true
            return 29
        }
        guard !finished else { return nil }
        return await withCheckedContinuation {
            pending = $0
            events.yield(.requestedNext)
        }
    }

    func supplyZero() {
        finished = true
        pending?.resume(returning: 0)
        pending = nil
    }

    func finish() {
        finished = true
        pending?.resume(returning: nil)
        pending = nil
    }

    nonisolated func now() -> Double {
        Issue.record("NoticeTimer must only request countdowns")
        return 0
    }

    nonisolated func ticks(every interval: Duration) -> AsyncStream<Double> {
        Issue.record("NoticeTimer must only request countdowns")
        return AsyncStream { $0.finish() }
    }
}

private extension HostSpy.Call {
    var served: UUID? { if case .serve(_, let id) = self { id } else { nil } }
}
