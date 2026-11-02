import CallAudioAccess
import Synchronization
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessModelTests {
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
    let time = Mutex(100.0)
    let probes = Mutex(0)
    let starts = AsyncStream<Void>.makeStream()
    let results = AsyncStream<Void>.makeStream()
    func model() async -> CallAudioAccessModel {
        let model = CallAudioAccessModel(device: { 10 }, now: { [self] in time.withLock { $0 } })
        await model.start(probe: { [self] in
            probes.withLock { $0 += 1 }; starts.continuation.yield(())
            for await _ in results.stream { return .heard }
            return .refused
        }, sleep: { _ in throw CancellationError() }, changes: AsyncStream { $0.finish() })
        return model
    }
    func started() async { for await _ in starts.stream { return } }
    func complete() { results.continuation.yield(()) }
}
