import CallAudioAccess
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessTests {
    @Test func join() { assert(makeProbingState(), .refresh(now: 100, device: 10)) }

    @Test func recordingExcludesProbing() {
        var state = makeHeardState(); state.recording = true
        assert(state, .refresh(now: 131, device: 10)) { $0.ready = false }
    }

    @Test func nilAndZeroOutputDoNotProbe() {
        for output: UInt32? in [nil, 0] {
            assert(makeHeardState(), .refresh(now: 101, device: output)) {
                $0.device = output; $0.generation = 2
                $0.evidence = nil; $0.measuredAt = nil; $0.ready = false; $0.published = false
            }
        }
    }

    @Test func exactlyThirtySecondsFutureAndNonfiniteTimesAreNotFresh() {
        for time in [130.0, 99, .infinity, -.infinity, .nan] {
            assert(makeHeardState(), .refresh(now: time, device: 10)) {
                $0.ready = false; $0.generation = 2
                $0.phase = .probing(generation: 2, device: 10)
            }
        }
        for time in [100.0, 129.999] {
            assert(makeHeardState(), .refresh(now: time, device: 10))
        }
        for time in [Double.infinity, -.infinity, .nan] {
            assert(makeProbingState(), .measured(generation: 1, evidence: .heard, device: 10, at: time)) {
                $0.phase = .idle
            }
        }
    }

    @Test func invalidationMidProbeThenMeasured() {
        let state = makeProbingState()
        assert(state, .invalidated) { $0.generation = 2 }
        let invalid = AccessReducer.reduce(state, .invalidated)
        assert(invalid, .measured(generation: 1, evidence: .heard, device: 10, at: 100)) { $0.phase = .idle }
    }

    @Test func repeatedInvalidationDoesNotResetGenerationsOrReleaseProbe() {
        var state = makeProbingState(); state.generation = 5
        assert(state, .invalidated) { $0.generation = 6 }
        let invalid = AccessReducer.reduce(state, .invalidated)
        assert(invalid, .invalidated) { $0.generation = 7 }
    }

    @Test func staleExpiryDoesNothing() { assert(makeHeardState(), .expired(generation: 0)) }

    @Test func routeChangeInvalidatesEvidenceAndJoinsOutstandingCleanup() {
        assert(makeHeardState(), .refresh(now: 101, device: 20)) {
            $0.device = 20; $0.generation = 3; $0.phase = .probing(generation: 3, device: 20)
            $0.evidence = nil; $0.measuredAt = nil; $0.ready = false; $0.published = false
        }
        assert(makeProbingState(), .refresh(now: 101, device: 20)) { $0.device = 20; $0.generation = 2 }
    }

    @Test func expiredHeardKeepsPublishedAvailable() {
        assert(makeHeardState(), .expired(generation: 1)) { $0.ready = false }
    }

    @Test func reservationRequiresFreshEvidenceAndNoProbe() {
        let state = makeHeardState()
        assert(state, .recording(true, now: 101, device: 10)) { $0.recording = true }
        assert(makeProbingState(), .recording(true, now: 101, device: 10))
        assert(state, .recording(true, now: 130, device: 10)) { $0.ready = false }
        let recording = AccessReducer.reduce(state, .recording(true, now: 101, device: 10))
        assert(recording, .recording(false, now: 101, device: nil)) { $0.recording = false }
    }

    @Test func measuredEvidenceControlsPublication() {
        for evidence: AccessEvidence in [.heard, .silent, .refused] {
            assert(makeProbingState(), .measured(generation: 1, evidence: evidence, device: 10, at: 100)) {
                $0.phase = .idle; $0.evidence = evidence; $0.measuredAt = 100
                $0.ready = evidence == .heard; $0.published = evidence == .heard
            }
        }
    }

    @Test func invalidationClearsPublishedEvidence() {
        assert(makeHeardState(), .invalidated) {
            $0.generation = 2; $0.evidence = nil; $0.measuredAt = nil
            $0.ready = false; $0.published = false
        }
    }
}

@Suite(.timeLimit(.minutes(1)))
struct AccessDoerTests {
    @Test func sameProbingStateSeenTwiceMeasuresOnce() async {
        let rig = DoerRig(), doer: AccessDoer
        doer = rig.doer()
        defer { doer.end() }
        doer.act(on: makeProbingState()); doer.act(on: makeProbingState())
        await rig.started()
        rig.finishProbe()
        #expect(await rig.next() == .measured(generation: 1, evidence: .heard, device: 10, at: 100))
        #expect(rig.calls.withLock { $0 } == 1)
    }

    @Test func invalidatedProbeCompletesOnlyAfterCleanup() async {
        let rig = DoerRig(), doer: AccessDoer
        doer = rig.doer()
        defer { doer.end() }
        doer.act(on: makeProbingState())
        await rig.started()
        doer.act(on: AccessReducer.reduce(makeProbingState(), .invalidated))
        #expect(rig.events.withLock { $0 }.isEmpty)
        rig.finishProbe()
        #expect(await rig.next() == .measured(generation: 1, evidence: .heard, device: 10, at: 100))
    }

    @Test func probeCompletionUsesPostCleanupClockAndRejectsChangedOutput() async {
        for changed in [false, true] {
            let rig = DoerRig()
            let doer = rig.doer()
            doer.act(on: makeProbingState())
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
        doer.act(on: makeHeardState()); doer.act(on: makeHeardState())
        await rig.timerStarted()
        rig.fireTimer()
        #expect(await rig.next() == .expired(generation: 1))
        #expect(rig.delays.withLock { $0 } == [.seconds(30)])
    }

    @Test func oldExpiryCannotClearNewEvidence() async {
        let rig = DoerRig()
        let doer = rig.doer()
        defer { doer.end() }
        doer.act(on: makeHeardState())
        await rig.timerStarted()
        var newer = makeHeardState(); newer.generation = 2; newer.measuredAt = 120
        rig.fireTimer()
        assert(newer, await rig.next())
    }
}

private func makeHeardState() -> AccessState {
    var state = AccessState()
    state.evidence = .heard; state.device = 10; state.measuredAt = 100; state.ready = true; state.published = true; state.generation = 1
    return state
}
private func makeProbingState() -> AccessState {
    var state = AccessState(); state.device = 10; state.generation = 1; state.phase = .probing(generation: 1, device: 10)
    return state
}
private func assert(_ state: AccessState, _ event: AccessEvent,
                    sourceLocation: SourceLocation = #_sourceLocation,
                    changes: (inout AccessState) -> Void = { _ in }) {
    var expected = state
    changes(&expected)
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
