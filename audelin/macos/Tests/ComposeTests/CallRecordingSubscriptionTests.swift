import CoreAudioProcesses
import Recording
import Testing
import Compose
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
                #expect(await rig.recording.snapshot() == initial)
                #expect(rig.session.effects.all.isEmpty)
            }
        }
    }

    @Test func cancellationPreventsLaterEventsAndIsIdempotent() async throws {

        try await withCallForwarding { rig in
            rig.calls.yield(.started(app: "meeting"))
            let before = try await rig.state(in: .recording)
            rig.forwarding.cancel()
            rig.forwarding.cancel()
            rig.calls.yield(.ended(app: "meeting"))
            rig.calls.yield(.started(app: "another meeting"))
            rig.calls.finish(throwing: ScriptFailure.failed)
            await rig.forwarding.wait()
            #expect(await rig.recording.snapshot() == before)
            #expect(rig.session.effects.all == [.beginSession(id: 1)])
        }
    }

    @Test func bufferedStartIsForwardedWithoutRetainingRecording() async throws {

        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        defer { source.continuation.finish() }
        let session = CallSession()
        var recording: Recording? = Recording(handler: .init(session: session), initial: .init())
        weak let destination = recording
        source.continuation.yield(.started(app: "already on"))
        let forwarding = CallRecordingSubscription(calls: source.stream, recording: try #require(recording))
        defer { forwarding.cancel() }
        let states = await (try #require(recording)).states()
        for await state in states {
            if state.callOn { break }
        }
        #expect(await (try #require(recording)).snapshot().callOn)
        await (try #require(recording)).end()
        recording = nil
        #expect(destination == nil)
        source.continuation.yield(.ended(app: "already on"))
        source.continuation.finish()
        await forwarding.wait()
        #expect(session.effects.all.isEmpty)
    }

    @Test func compositionStartsDetectionAndReturnsStartFailure() async throws {

        let session = CallSession()
        let recording = Recording(handler: .init(session: session), initial: .init(automatic: true, missing: []))
        let processes = CoreAudioProcesses(binding: CallBinding(fails: false), clock: UnusedCallClock())
        let forwarding = try composeCalls(processes, to: recording)
        defer { forwarding.cancel(); processes.stop() }
        for await state in await recording.states() {
            if state.phase == .recording { break }
        }
        #expect(await recording.snapshot().session == .init(id: 1, origin: .call))
        processes.stop()
        await forwarding.wait()
        for await state in await recording.states() {
            if state.phase == .idle { break }
        }
        #expect(session.effects.all == [.beginSession(id: 1), .endSession(id: 1)])
        let refused = CoreAudioProcesses(binding: CallBinding(fails: true), clock: UnusedCallClock())
        defer { refused.stop() }
        #expect(throws: ScriptFailure.failed) { try composeCalls(refused, to: recording) }
        await recording.end()
    }
}

private func assertDetectionLossEndsCall(error: (any Error)?) async throws {

    try await withCallForwarding { rig in
        rig.calls.yield(.started(app: "meeting"))
        _ = try await rig.state(in: .recording)
        rig.calls.finish(throwing: error)
        await rig.forwarding.wait()
        let ended = try await rig.state(in: .idle)
        #expect(!ended.callOn)
        #expect(ended.session == nil)
        #expect(rig.session.effects.all == [.beginSession(id: 1), .endSession(id: 1)])
    }
}

private struct CallForwardingRig: Sendable {

    let recording: Recording
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

        forwarding.cancel()
        calls.finish()
        await forwarding.wait()
        await recording.end()
    }
}

private func withCallForwarding(
    initial: RecordingState = .init(automatic: true, missing: []),
    _ body: (CallForwardingRig) async throws -> Void
) async throws {

    let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
    let session = CallSession()
    let recording = Recording(handler: .init(session: session), initial: initial)
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

    let effects = Values<RecordingEffect>()

    func begin(id: UInt64) async -> RecordingSessionReport {

        effects.append(.beginSession(id: id))
        return .ready
    }

    func end(id: UInt64) async { effects.append(.endSession(id: id)) }
}

final class CallBinding: ProcessBinding {

    let fails: Bool
    private struct State {

        var input: Bool
        var listeners: [Int: @Sendable () -> Void] = [:]
        var nextListener = 0
    }
    private let state: Mutex<State>

    init(fails: Bool, input: Bool = true) {

        self.fails = fails
        state = Mutex(State(input: input))
    }

    var activeListeners: Int { state.withLock { $0.listeners.count } }

    func queuedNotifications() -> [@Sendable () -> Void] {

        state.withLock { Array($0.listeners.values) }
    }

    func setInput(_ input: Bool) {

        state.withLock { $0.input = input }
        queuedNotifications().forEach { $0() }
    }

    func processObjects() throws -> [ProcessObject] {

        if fails { throw ScriptFailure.failed }
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
