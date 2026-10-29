import CallAudioAccess
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessTests {
    @Test func join() { assert(probing(), .refresh(now: 100, device: 10), reducedTo: probing()) }

    @Test func recordingExcludesProbing() {
        var state = heard(); state.recording = true
        var expected = state; expected.ready = false
        assert(state, .refresh(now: 131, device: 10), reducedTo: expected)
    }

    @Test func nilAndZeroOutputDoNotProbe() {
        for output: UInt32? in [nil, 0] {
            var expected = AccessState(); expected.device = output; expected.generation = 2
            assert(heard(), .refresh(now: 101, device: output), reducedTo: expected)
        }
    }

    @Test func exactlyThirtySecondsFutureAndNonfiniteTimesAreNotFresh() {
        for time in [130.0, 99, .infinity, -.infinity, .nan] {
            var expected = heard(); expected.ready = false; expected.generation = 2
            expected.phase = .probing(generation: 2, device: 10)
            assert(heard(), .refresh(now: time, device: 10), reducedTo: expected)
        }
        for time in [100.0, 129.999] {
            assert(heard(), .refresh(now: time, device: 10), reducedTo: heard())
        }
        for time in [Double.infinity, -.infinity, .nan] {
            var expected = AccessState(); expected.generation = 1; expected.device = 10
            assert(probing(), .measured(generation: 1, evidence: .heard, device: 10, at: time), reducedTo: expected)
        }
    }

    @Test func invalidationMidProbeThenMeasured() {
        var invalid = probing(); invalid.generation = 2
        assert(probing(), .invalidated, reducedTo: invalid)
        var complete = invalid; complete.phase = .idle
        assert(invalid, .measured(generation: 1, evidence: .heard, device: 10, at: 100), reducedTo: complete)
    }

    @Test func repeatedInvalidationDoesNotResetGenerationsOrReleaseProbe() {
        var state = probing(); state.generation = 5
        var expected = state; expected.generation = 6
        assert(state, .invalidated, reducedTo: expected)
        expected.generation = 7
        assert(AccessReducer.reduce(state, .invalidated), .invalidated, reducedTo: expected)
    }

    @Test func staleExpiryDoesNothing() { assert(heard(), .expired(generation: 0), reducedTo: heard()) }

    @Test func routeChangeInvalidatesEvidenceAndJoinsOutstandingCleanup() {
        var next = AccessState(); next.device = 20; next.generation = 3; next.phase = .probing(generation: 3, device: 20)
        assert(heard(), .refresh(now: 101, device: 20), reducedTo: next)
        var joined = probing(); joined.device = 20; joined.generation = 2
        assert(probing(), .refresh(now: 101, device: 20), reducedTo: joined)
    }

    @Test func expiredHeardKeepsPublishedAvailable() {
        var expected = heard(); expected.ready = false
        assert(heard(), .expired(generation: 1), reducedTo: expected)
        #expect(expected.published)
    }

    @Test func reservationRequiresFreshEvidenceAndNoProbe() {
        var expected = heard(); expected.recording = true
        assert(heard(), .recording(true, now: 101, device: 10), reducedTo: expected)
        assert(probing(), .recording(true, now: 101, device: 10), reducedTo: probing())
        var stale = heard(); stale.ready = false
        assert(heard(), .recording(true, now: 130, device: 10), reducedTo: stale)
        assert(expected, .recording(false, now: 101, device: nil), reducedTo: heard())
    }

    @Test func measuredEvidenceControlsPublication() {
        for evidence: AccessEvidence in [.heard, .silent, .refused] {
            var expected = heard(); expected.evidence = evidence; expected.ready = evidence == .heard
            assert(probing(), .measured(generation: 1, evidence: evidence, device: 10, at: 100), reducedTo: expected)
            #expect(expected.published == (evidence == .heard))
        }
    }
}

@Suite(.timeLimit(.minutes(1)))
struct AccessDoerTests {
    @Test func sameProbingStateSeenTwiceMeasuresOnce() async {
        let rig = DoerRig(), doer: AccessDoer
        doer = rig.doer()
        defer { doer.end() }
        doer.act(on: probing()); doer.act(on: probing())
        await rig.started()
        rig.finishProbe()
        #expect(await rig.next() == .measured(generation: 1, evidence: .heard, device: 10, at: 100))
        #expect(rig.calls.withLock { $0 } == 1)
    }

    @Test func invalidatedProbeCompletesOnlyAfterCleanup() async {
        let rig = DoerRig(), doer: AccessDoer
        doer = rig.doer()
        defer { doer.end() }
        doer.act(on: probing())
        await rig.started()
        doer.act(on: AccessReducer.reduce(probing(), .invalidated))
        #expect(rig.events.withLock { $0 }.isEmpty)
        rig.finishProbe()
        #expect(await rig.next() == .measured(generation: 1, evidence: .heard, device: 10, at: 100))
    }

    @Test func probeCompletionUsesPostCleanupClockAndRejectsChangedOutput() async {
        for changed in [false, true] {
            let rig = DoerRig()
            let doer = rig.doer()
            doer.act(on: probing())
            await rig.started()
            rig.time.withLock { $0 = 200 }
            if changed { rig.output.withLock { $0 = 20 } }
            rig.finishProbe()
            #expect(await rig.next() == .measured(generation: 1, evidence: changed ? .refused : .heard, device: changed ? 20 : 10, at: 200))
            doer.end()
        }
    }

    @Test func sameHeardStateSeenTwiceSchedulesExpiryOnce() async {
        let rig = DoerRig()
        let doer = rig.doer()
        defer { doer.end() }
        doer.act(on: heard()); doer.act(on: heard())
        await rig.timerStarted()
        rig.fireTimer()
        #expect(await rig.next() == .expired(generation: 1))
        #expect(rig.delays.withLock { $0 } == [.seconds(30)])
    }

    @Test func oldExpiryCannotClearNewEvidence() async {
        let rig = DoerRig()
        let doer = rig.doer()
        defer { doer.end() }
        doer.act(on: heard())
        await rig.timerStarted()
        var newer = heard(); newer.generation = 2; newer.measuredAt = 120
        rig.fireTimer()
        assert(newer, await rig.next(), reducedTo: newer)
    }
}

private func heard() -> AccessState {
    var state = AccessState()
    state.evidence = .heard; state.device = 10; state.measuredAt = 100; state.ready = true; state.generation = 1
    return state
}
private func probing() -> AccessState {
    var state = AccessState(); state.device = 10; state.generation = 1; state.phase = .probing(generation: 1, device: 10)
    return state
}
private func assert(_ state: AccessState, _ event: AccessEvent, reducedTo expected: AccessState, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(AccessReducer.reduce(state, event) == expected, sourceLocation: sourceLocation)
}

private final class DoerRig: Sendable {
    let calls = Mutex(0)
    let output = Mutex<UInt32?>(10)
    let time = Mutex(100.0)
    let events = Mutex<[AccessEvent]>([])
    let delays = Mutex<[Duration]>([])
    let probe = AsyncStream<Void>.makeStream()
    let timer = AsyncStream<Void>.makeStream()
    let starts = AsyncStream<Void>.makeStream()
    let timerStarts = AsyncStream<Void>.makeStream()
    let sent = AsyncStream<AccessEvent>.makeStream()
    func doer() -> AccessDoer {
        AccessDoer(probe: { [self] in
            calls.withLock { $0 += 1 }; starts.continuation.yield(())
            for await _ in probe.stream { break }
            return .heard
        }, device: { [self] in output.withLock { $0 } }, now: { [self] in time.withLock { $0 } }, sleep: { [self] delay in
            delays.withLock { $0.append(delay) }; timerStarts.continuation.yield(())
            for await _ in timer.stream { return }
            throw CancellationError()
        }, send: { [self] event in events.withLock { $0.append(event) }; sent.continuation.yield(event) })
    }
    func started() async { for await _ in starts.stream { return } }
    func timerStarted() async { for await _ in timerStarts.stream { return } }
    func finishProbe() { probe.continuation.yield(()) }
    func fireTimer() { timer.continuation.yield(()) }
    func next() async -> AccessEvent {
        for await event in sent.stream { return event }
        preconditionFailure("The doer must send a result")
    }
}
