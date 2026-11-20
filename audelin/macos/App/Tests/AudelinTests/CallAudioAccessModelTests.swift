import CallAudioAccess
import Composer
import Synchronization
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessModelTests {
    @Test func anOutputChangeDuringMeasurementLogsTheRefusalAndItsReason() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let request = await model.prepareRefresh(now: 100, device: 10)
        await rig.started()
        rig.output.withLock { $0 = 20 }
        rig.complete()
        #expect(await request.value() == false)
        #expect(rig.sink.entries.withLock { $0 } == [
            .init(category: .conditions, message: "call audio probe kind=refused", error: "output changed during measurement"),
        ])
        await model.end()
    }

    @Test func freshRefreshReturnsWithoutPublication() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let policy = await model.policy()
        let first = Task { await policy.refresh() }
        await rig.started()
        rig.complete()
        #expect(await first.value)
        let updates = await policy.states()
        #expect(await policy.refresh())
        #expect(rig.probes.withLock { $0 } == 1)
        await model.end()
        var states: [AccessState] = []
        for await state in updates { states.append(state) }
        #expect(states.count == 1)
    }

    @Test func concurrentRefreshesShareOneProbe() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let first = await model.prepareRefresh(now: 100, device: 10)
        await rig.started()
        let second = await model.prepareRefresh(now: 100, device: 10)
        rig.complete()
        #expect(await first.value())
        #expect(await second.value())
        #expect(rig.probes.withLock { $0 } == 1)
        await model.end()
    }

    @Test func completionBeforeWaitIsNotLost() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let request = await model.prepareRefresh(now: 100, device: 10)
        await rig.started()
        let states = await model.states()
        rig.complete()
        for await state in states where state.phase == .idle { break }
        #expect(await request.value())
        #expect(await model.refresh())
        await model.end()
    }

    @Test func waiterDoesNotJoinALaterProbe() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let first = await model.prepareRefresh(now: 100, device: 10)
        await rig.started()
        await model.send(.invalidated)
        let current = await model.states()
        rig.complete()
        for await state in current where state.phase == .idle { break }
        let later = await model.prepareRefresh(now: 100, device: 10)
        await rig.started()
        #expect(await first.value() == false)
        #expect(rig.probes.withLock { $0 } == 2)
        rig.complete()
        #expect(await later.value())
        await model.end()
    }

    @Test func modelEndResolvesWaitersFalse() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let pending = Task { await model.refresh() }
        await rig.started()
        await model.end()
        #expect(await pending.value == false)
        #expect(await model.refresh() == false)
        #expect(await model.reserve() == false)
        await model.release()
    }

    @Test func cancellingOneRefreshDoesNotCancelSharedProbe() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        let first = Task { await model.refresh() }
        await rig.started()
        let request = await model.prepareRefresh(now: 100, device: 10)
        let second = Task { await request.value() }
        first.cancel()
        #expect(await first.value == false)
        rig.complete()
        #expect(await second.value)
        #expect(rig.probes.withLock { $0 } == 1)
        await model.end()
    }

    @Test func rejectedReservationIsNotSuccessWhileRecording() async {
        let rig = AccessModelRig()
        let model = await rig.model()
        rig.complete()
        #expect(await model.refresh())
        #expect(await model.reserve())
        #expect(await model.reserve() == false)
        rig.time.withLock { $0 = 131 }
        #expect(await model.refresh() == false)
        #expect(await model.reserve() == false)
        #expect(rig.probes.withLock { $0 } == 1)
        await model.release()
        rig.complete()
        #expect(await model.refresh())
        #expect(await model.reserve())
        await model.end()
    }
}

private final class AccessModelRig: Sendable {
    let sink = AccessLogSink()
    let output = Mutex<UInt32?>(10)
    let time = Mutex(100.0)
    let probes = Mutex(0)
    let starts = AsyncStream<Void>.makeStream()
    let results = AsyncStream<Void>.makeStream()
    func model() async -> CallAudioAccessModel {
        let model = CallAudioAccessModel(device: { [self] in output.withLock { $0 } }, now: { [self] in time.withLock { $0 } }, sink: sink)
        await model.start(probe: { [self] in
            probes.withLock { $0 += 1 }; starts.continuation.yield(())
            for await _ in results.stream { return .heard }
            return .refused("cancelled")
        }, sleep: { _ in throw CancellationError() }, changes: AsyncStream { $0.finish() })
        return model
    }
    func started() async { for await _ in starts.stream { return } }
    func complete() { results.continuation.yield(()) }
}

private final class AccessLogSink: LogSink {
    let entries = Mutex<[LogEntry]>([])
    func write(_ entry: LogEntry) { entries.withLock { $0.append(entry) } }
}
