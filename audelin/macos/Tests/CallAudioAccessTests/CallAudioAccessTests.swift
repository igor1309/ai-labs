import CallAudioAccess
import Foundation
import IMRxObservation
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessTests {
    @Test func onlyFreshHeardAllowsStart() {
        let request = UUID()
        for evidence: AccessEvidence in [.heard, .silent, .refused] {
            for age in [0.0, 29.999, 30, 31, -1] {
                var state = heard()
                state.evidence = evidence
                var expected = state
                let fresh = evidence == .heard && age >= 0 && age < 30
                expected.available = fresh
                if fresh { expected.answers[request] = true }
                else { expected.waiting = [request]; expected.generation = 2; expected.probing = 2 }
                assert(state, .refresh(request, now: 100 + age, device: 10), reducedTo: expected)
                assert(state, .refresh(request, now: 100 + age, device: 10), effect: fresh ? nil : .probe(2))
            }
        }
    }

    @Test func silentRefusedAndMissingOutputBlockBothStartOrigins() {
        let id = UUID()
        for evidence: AccessEvidence in [.silent, .refused] {
            var state = AccessState()
            state.generation = 1; state.probing = 1; state.waiting = [id]; state.device = 10
            var expected = state
            expected.probing = nil; expected.waiting = []; expected.answers[id] = false
            expected.evidence = evidence; expected.measuredAt = 100
            assert(state, .measured(generation: 1, evidence, device: 10, at: 100), reducedTo: expected)
            assert(state, .measured(generation: 1, evidence, device: 10, at: 100), effect: nil)
        }
        var expected = heard()
        expected.evidence = nil; expected.available = false; expected.answers[id] = false
        assert(heard(), .refresh(id, now: 101, device: nil), reducedTo: expected)
        assert(heard(), .refresh(id, now: 101, device: nil), effect: nil)
    }

    @Test func expiredOrInvalidatedEvidenceRequiresRefresh() {
        for event: AccessEvent in [.invalidated, .expired(1)] {
            let before = heard()
            var expected = before
            expected.evidence = nil; expected.available = false
            if event == .invalidated { expected.generation = 2; expected.measuredAt = nil }
            assert(before, event, reducedTo: expected)
            assert(before, event, effect: nil)
            let id = UUID()
            var refreshing = expected
            refreshing.generation += 1; refreshing.probing = refreshing.generation; refreshing.waiting = [id]
            assert(expected, .refresh(id, now: 102, device: 10), reducedTo: refreshing)
            assert(expected, .refresh(id, now: 102, device: 10), effect: .probe(refreshing.generation))
        }
        let id = UUID()
        var changed = heard()
        changed.available = false; changed.device = 20; changed.generation = 2; changed.probing = 2; changed.waiting = [id]
        assert(heard(), .refresh(id, now: 101, device: 20), reducedTo: changed)
        assert(heard(), .refresh(id, now: 101, device: 20), effect: .probe(2))
    }

    @Test func concurrentRefreshesShareOneProbe() async {
        let probe = PolicyProbeSpy()
        let model = PolicyModel()
        await model.start(handler: AccessEffectHandler(probe: { await probe.measure() }, device: { 10 }, now: { 100 }, sleep: { _ in throw CancellationError() }))
        let policy = AccessPolicy(send: { await model.send($0) }, states: { await model.states() }, device: { 10 }, now: { 100 })
        let first = Task { await policy.refresh() }
        await probe.started()
        let second = Task { await policy.refresh() }
        for await state in await policy.states() {
            if state.waiting.count == 2 {
                let id = UUID()
                var expected = state; expected.waiting.insert(id)
                assert(state, .refresh(id, now: 100, device: 10), reducedTo: expected)
                assert(state, .refresh(id, now: 100, device: 10), effect: nil)
                break
            }
        }
        await probe.complete(.heard)
        #expect(await first.value)
        #expect(await second.value)
        #expect(await probe.calls == 1)
        await model.end()
    }

    @Test func runningRecordingDoesNotLaunchProbe() {
        for now in [101.0, 131] {
            var state = heard(); state.recording = true
            let id = UUID()
            var expected = state; expected.available = now == 101; expected.answers[id] = now == 101
            assert(state, .refresh(id, now: now, device: 10), reducedTo: expected)
            assert(state, .refresh(id, now: now, device: 10), effect: nil)
        }
    }

    @Test func invalidationDuringMeasurementRejectsLateEvidence() {
        var state = heard(); state.probing = 1; state.waiting = [UUID()]
        state = AccessReducer.reduce(state, .invalidated).0
        var expected = state
        expected.probing = nil
        for id in expected.waiting { expected.answers[id] = false }
        expected.waiting = []
        assert(state, .measured(generation: 1, .heard, device: 10, at: 101), reducedTo: expected)
        assert(state, .measured(generation: 1, .heard, device: 10, at: 101), effect: nil)
    }

    @Test func cleanupCompletesBeforeSessionStarts() {
        let request = UUID(), reservation = UUID()
        var measuring = AccessState()
        measuring.generation = 1; measuring.probing = 1; measuring.device = 10; measuring.waiting = [request]
        var rejected = measuring; rejected.answers[reservation] = false
        assert(measuring, .recording(true, reservation, now: 100, device: 10), reducedTo: rejected)
        assert(measuring, .recording(true, reservation, now: 100, device: 10), effect: nil)
        var completed = heard(); completed.answers[request] = true
        assert(measuring, .measured(generation: 1, .heard, device: 10, at: 100), reducedTo: completed)
        assert(measuring, .measured(generation: 1, .heard, device: 10, at: 100), effect: .expire(1, at: 130))
        var reserved = completed; reserved.recording = true; reserved.answers[reservation] = true
        assert(completed, .recording(true, reservation, now: 101, device: 10), reducedTo: reserved)
        assert(completed, .recording(true, reservation, now: 101, device: 10), effect: nil)
    }

    @Test func deferredStartRechecksEvidence() {
        var running = heard(); running.recording = true
        let stop = UUID(), refresh = UUID()
        var stopped = running; stopped.recording = false; stopped.answers[stop] = true
        assert(running, .recording(false, stop, now: 131, device: nil), reducedTo: stopped)
        assert(running, .recording(false, stop, now: 131, device: nil), effect: nil)
        var refreshing = stopped
        refreshing.available = false; refreshing.generation = 2; refreshing.probing = 2; refreshing.waiting = [refresh]
        assert(stopped, .refresh(refresh, now: 131, device: 10), reducedTo: refreshing)
        assert(stopped, .refresh(refresh, now: 131, device: 10), effect: .probe(2))
    }

    @Test func routeChangesDuringConcurrentRefreshAndAtReservationFailClosed() {
        let first = UUID(), second = UUID()
        var measuring = AccessState()
        measuring.generation = 1; measuring.probing = 1; measuring.device = 10; measuring.waiting = [first]
        var changed = measuring
        changed.generation = 2; changed.device = 20; changed.waiting.insert(second)
        assert(measuring, .refresh(second, now: 100, device: 20), reducedTo: changed)
        assert(measuring, .refresh(second, now: 100, device: 20), effect: nil)
        for (time, device): (Double, UInt32?) in [(130, 10), (101, 20), (101, nil)] {
            var rejected = heard(); rejected.available = false; rejected.answers[first] = false
            assert(heard(), .recording(true, first, now: time, device: device), reducedTo: rejected)
            assert(heard(), .recording(true, first, now: time, device: device), effect: nil)
        }
    }

    @Test func effectUsesPostCleanupClockAndRejectsChangedOutput() async {
        for changed in [false, true] {
            let probe = PolicyProbeSpy()
            let device = Mutex<UInt32>(10)
            let time = Mutex(100.0)
            let handler = AccessEffectHandler(probe: { await probe.measure() }, device: { device.withLock { $0 } }, now: { time.withLock { $0 } }, sleep: { _ in throw CancellationError() })
            let result = Task { await handler.handle(.probe(1)) }
            await probe.started()
            time.withLock { $0 = 200 }
            if changed { device.withLock { $0 = 20 } }
            await probe.complete(.heard)
            #expect(await result.value == .measured(generation: 1, changed ? .refused : .heard, device: changed ? 20 : 10, at: 200))
        }
        let durations = Mutex<[Duration]>([])
        let handler = AccessEffectHandler(probe: { .refused }, device: { nil }, now: { 0 }, sleep: { duration in durations.withLock { $0.append(duration) } })
        #expect(await handler.handle(.expire(5, at: 30)) == .expired(5))
        #expect(durations.withLock { $0 } == [.seconds(30)])
    }
}

private func heard() -> AccessState {
    var state = AccessState()
    state.evidence = .heard; state.device = 10; state.measuredAt = 100; state.available = true; state.generation = 1
    return state
}

private func assert(_ state: AccessState, _ event: AccessEvent, reducedTo expected: AccessState, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(AccessReducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}
private func assert(_ state: AccessState, _ event: AccessEvent, effect expected: AccessEffect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(AccessReducer.reduce(state, event).1 == expected, sourceLocation: sourceLocation)
}

private actor PolicyProbeSpy {
    var calls = 0
    var pending: CheckedContinuation<AccessEvidence, Never>?
    let starts = AsyncStream<Void>.makeStream()
    func measure() async -> AccessEvidence {
        calls += 1
        return await withCheckedContinuation { pending = $0; starts.continuation.yield(()) }
    }
    func started() async { for await _ in starts.stream { return } }
    func complete(_ answer: AccessEvidence) { pending?.resume(returning: answer); pending = nil }
}

private actor PolicyModel {
    var model: ObservableModel<AccessState, AccessEvent, AccessEffect>?
    nonisolated let subscribers = Mutex<[UUID: AsyncStream<AccessState>.Continuation]>([:])
    func start(handler: AccessEffectHandler) {
        model = ObservableModel(initialState: AccessState(), reduce: { [weak self] state, event in
            let (next, effect) = AccessReducer.reduce(state, event)
            self?.publish(next)
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { output in
                let task = Task { if let event = await handler.handle(effect) { output.yield(event) }; output.finish() }
                output.onTermination = { _ in task.cancel() }
            }
        }, isolation: self)
    }
    func send(_ event: AccessEvent) { model?.event(event) }
    nonisolated func publish(_ state: AccessState) { subscribers.withLock { for output in $0.values { output.yield(state) } } }
    func states() -> AsyncStream<AccessState> {
        let (stream, output) = AsyncStream<AccessState>.makeStream()
        output.yield(model?.state ?? .init())
        let id = UUID(); subscribers.withLock { $0[id] = output }
        output.onTermination = { [weak self] _ in Task { await self?.remove(id) } }
        return stream
    }
    func remove(_ id: UUID) { subscribers.withLock { _ = $0.removeValue(forKey: id) } }
    func end() { subscribers.withLock { for output in $0.values { output.finish() }; $0 = [:] }; model = nil }
}
