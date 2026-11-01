import CoreAudioProcesses
import Recording
import Testing
import Composer
import Synchronization

@Suite(.timeLimit(.minutes(1)))
struct CallRecordingSubscriptionTests {

    @Test func startsAndEndsArriveInOrderOnce() async throws {

        try await withCallForwarding { rig in
            for id in UInt64(1)...2 {
                rig.calls.yield(.started(app: "meeting"))
                let running = try await rig.state(in: .recording)
                #expect(running.callOn)
                #expect(running.session == .init(id: id, origin: .call))
                rig.calls.yield(.ended(app: "meeting"))
                let ended = try await rig.state(in: .idle)
                #expect(!ended.callOn)
            }
            rig.calls.finish()
            await rig.forwarding.wait()
            #expect(rig.session.effects.all == [
                .beginSession(id: 1), .endSession(id: 1),
                .beginSession(id: 2), .endSession(id: 2),
            ])
        }
    }

    @Test func failureDuringCallEndsRecordingOnce() async throws {

        try await assertDetectionLossEndsCall(error: ScriptFailure.failed)
    }

    @Test func finishDuringCallEndsRecordingOnce() async throws {

        try await assertDetectionLossEndsCall(error: nil)
    }

    @Test func terminationWithoutADetectedCallSendsNothing() async throws {

        var initial = RecordingState(automatic: false, missing: [])
        initial.callOn = true
        for error: ScriptFailure? in [nil, .failed] {
            try await withCallForwarding(initial: initial) { rig in
                rig.calls.finish(throwing: error)
                await rig.forwarding.wait()
                #expect(await rig.recording.state() == initial)
                #expect(rig.session.effects.all.isEmpty)
            }
        }
    }

    @Test func cancellationPreventsLaterEventsAndIsIdempotent() async throws {

        try await withCallForwarding { rig in
            rig.calls.yield(.started(app: "meeting"))
            let before = try await rig.state(in: .recording)
            await rig.forwarding.cancel()
            await rig.forwarding.cancel()
            rig.calls.yield(.ended(app: "meeting"))
            rig.calls.yield(.started(app: "another meeting"))
            rig.calls.finish(throwing: ScriptFailure.failed)
            await rig.forwarding.wait()
            for await _ in rig.forwarding.failures {
                Issue.record("Cancellation must not report a detector failure")
            }
            #expect(await rig.recording.state() == before)
            #expect(rig.session.effects.all == [.beginSession(id: 1)])
        }
    }

    @Test func bufferedStartIsForwarded() async throws {

        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        let session = CallSession()
        let recording = await composedRecording(session: session)
        source.continuation.yield(.started(app: "already on"))
        let forwarding = CallRecordingSubscription(calls: source.stream, recording: recording)
        for await state in await recording.states() {
            if state.callOn { break }
        }
        #expect(await recording.state().callOn)
        await forwarding.cancel()
        source.continuation.finish()
        await recording.end()
        #expect(session.effects.all.isEmpty)
    }

    @Test func cancelDuringTheRefreshSendsNoStart() async throws {

        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        let session = CallSession()
        let recording = await composedRecording(session: session, initial: .init(missing: []))
        let refreshing = Signal(), release = DrainGate()
        defer { refreshing.end(); release.release() }
        let forwarding = CallRecordingSubscription(calls: source.stream, recording: recording, beforeCallStarted: {
            refreshing.send()
            // The refresh ends when cancelled, as the conditions' refresh does.
            await withTaskCancellationHandler { await release.wait() } onCancel: { release.release() }
        })
        source.continuation.yield(.started(app: "meeting"))
        await refreshing.next()
        await forwarding.cancel()
        #expect(await recording.state().callOn == false)
        source.continuation.finish()
        await recording.end()
        #expect(session.effects.all.isEmpty)
    }

    @Test func cancelReturnsOnlyAfterTheSendInFlight() async throws {

        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        let session = CallSession()
        let base = await composedRecording(session: session, initial: .init(missing: []))
        let sending = Signal(), cancelled = Signal(), release = DrainGate()
        defer { sending.end(); cancelled.end(); release.release() }
        let recording = RecordingInputs(
            send: { event in
                sending.send()
                await withTaskCancellationHandler {
                    await release.wait()
                } onCancel: {
                    cancelled.send()
                }
                await base.send(event)
            },
            state: base.state, states: base.states, end: base.end
        )
        let forwarding = CallRecordingSubscription(calls: source.stream, recording: recording)
        source.continuation.yield(.started(app: "meeting"))
        await sending.next()
        let returned = Mutex(false)
        let cancelling = Task {
            await forwarding.cancel()
            returned.withLock { $0 = true }
        }
        await cancelled.next()
        #expect(returned.withLock { $0 } == false)
        release.release()
        await cancelling.value
        // The admitted start is delivered before cancel returns, and nothing after it.
        #expect(await base.state().callOn)
        source.continuation.yield(.ended(app: "meeting"))
        source.continuation.finish()
        await forwarding.wait()
        #expect(await base.state().callOn)
        await base.end()
    }

    @Test(.timeLimit(.minutes(1))) func endedRecordingReleasesItsSession() async throws {

        // The doer's task lets go of the Session once its states stream has
        // finished, at a time of its own, so the test awaits the release itself.
        let released = AsyncStream<Void>.makeStream()
        var session: CallSession? = CallSession(released: released.continuation)
        var recording: RecordingInputs? = await composedRecording(session: try #require(session))
        session = nil
        await recording?.end()
        recording = nil
        for await _ in released.stream {}
    }

    @Test func compositionReportsStartupAndRuntimeFailure() async throws {

        let session = CallSession()
        let recording = await composedRecording(session: session, initial: .init(automatic: true, missing: []))
        let binding = CallBinding(fails: false)
        let processes = CoreAudioProcesses(binding: binding, clock: UnusedCallClock())
        let forwarding = try await composeCalls(processes, to: recording, conditions: nil)
        for await state in await recording.states() {
            if state.phase == .recording { break }
        }
        #expect(await recording.state().session == .init(id: 1, origin: .call))
        binding.fail()
        await forwarding.wait()
        var failures = [ScriptFailure]()
        for await error in forwarding.failures {
            failures.append(try #require(error as? ScriptFailure))
        }
        #expect(failures == [.failed])
        for await state in await recording.states() {
            if state.phase == .idle { break }
        }
        #expect(session.effects.all == [.beginSession(id: 1), .endSession(id: 1)])
        let refused = CoreAudioProcesses(binding: CallBinding(fails: true), clock: UnusedCallClock())
        await #expect(throws: ScriptFailure.failed) { try await composeCalls(refused, to: recording, conditions: nil) }
        await recording.end()
    }
}

private func assertDetectionLossEndsCall(error: (any Error)?) async throws {

    try await withCallForwarding { rig in
        rig.calls.yield(.started(app: "meeting"))
        _ = try await rig.state(in: .recording)
        rig.calls.finish(throwing: error)
        await rig.forwarding.wait()
        var failures = [ScriptFailure]()
        for await failure in rig.forwarding.failures {
            failures.append(try #require(failure as? ScriptFailure))
        }
        #expect(failures == (error == nil ? [] : [.failed]))
        let ended = try await rig.state(in: .idle)
        #expect(!ended.callOn)
        #expect(ended.session == nil)
        #expect(rig.session.effects.all == [.beginSession(id: 1), .endSession(id: 1)])
    }
}

private struct CallForwardingRig: Sendable {

    let recording: RecordingInputs
    let session: CallSession
    let calls: AsyncThrowingStream<CallEvent, any Error>.Continuation
    let forwarding: CallRecordingSubscription

    func state(in phase: RecordingState.Phase) async throws -> RecordingState {

        for await state in await recording.states() {
            if state.phase == phase { return state }
        }
        throw ScriptFailure.failed
    }

    func end() async {

        await forwarding.cancel()
        calls.finish()
        await recording.end()
    }
}

private func withCallForwarding(
    initial: RecordingState = .init(automatic: true, missing: []),
    _ body: (CallForwardingRig) async throws -> Void
) async throws {

    let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
    let session = CallSession()
    let recording = await composedRecording(session: session, initial: initial)
    let rig = CallForwardingRig(
        recording: recording, session: session, calls: source.continuation,
        forwarding: CallRecordingSubscription(calls: source.stream, recording: recording)
    )
    do {
        try await body(rig)
        await rig.end()
    } catch {
        await rig.end()
        throw error
    }
}

private final class CallSession: RecordingSession {

    enum Call: Equatable { case beginSession(id: UInt64), endSession(id: UInt64) }

    let effects = Values<Call>()
    private let released: AsyncStream<Void>.Continuation?

    init(released: AsyncStream<Void>.Continuation? = nil) { self.released = released }

    deinit { released?.finish() }

    func begin(id: UInt64) async -> RecordingSessionReport {

        effects.append(.beginSession(id: id))
        return .ready
    }

    func end(id: UInt64) async { effects.append(.endSession(id: id)) }
}

final class CallBinding: ProcessBinding {

    private struct State {

        var fails: Bool
        var input: Bool
        var listeners: [Int: @Sendable () -> Void] = [:]
        var nextListener = 0
    }
    private let state: Mutex<State>

    init(fails: Bool, input: Bool = true) {

        state = Mutex(State(fails: fails, input: input))
    }

    var activeListeners: Int { state.withLock { $0.listeners.count } }

    func queuedNotifications() -> [@Sendable () -> Void] {

        state.withLock { Array($0.listeners.values) }
    }

    func setInput(_ input: Bool) {

        state.withLock { $0.input = input }
        queuedNotifications().forEach { $0() }
    }

    func fail() {

        state.withLock { $0.fails = true }
        queuedNotifications().forEach { $0() }
    }

    func processObjects() throws -> [ProcessObject] {

        if state.withLock({ $0.fails }) { throw ScriptFailure.failed }
        return [1]
    }

    func pid(of object: ProcessObject) -> Int32? { 42 }
    func bundleID(of object: ProcessObject) -> String? { "us.zoom.xos" }
    func name(of object: ProcessObject) -> String { "meeting" }
    func isRunningInput(_ object: ProcessObject) -> Bool { state.withLock { $0.input } }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation { listen(changed) }
    func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation { listen(changed) }

    private func listen(_ changed: @escaping @Sendable () -> Void) -> Cancellation {

        let id = state.withLock {
            $0.nextListener += 1
            $0.listeners[$0.nextListener] = changed
            return $0.nextListener
        }
        return Cancellation { [weak self] in self?.state.withLock { _ = $0.listeners.removeValue(forKey: id) } }
    }
}

struct UnusedCallClock: CallClock {

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        Issue.record("A continuously active call must not schedule an end")
        return Cancellation {}
    }
}
