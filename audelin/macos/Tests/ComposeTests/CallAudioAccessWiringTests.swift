import CallAudioAccess
import Foundation
import MenuBar
import Preferences
import Recording
import Synchronization
import Testing
@testable import Audelin
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessWiringTests {
    @Test func cleanupCompletesBeforeSessionStarts() async throws {
        try await withComposeFolder { root in
            let rig = try await AccessCompositionRig(root: root)
            let recording = await rig.recording()
            let starting = Task { await recording.send(.userStart) }
            await rig.probe.started.next()
            #expect(rig.events.all.isEmpty)
            rig.probe.complete(.heard)
            await starting.value
            await rig.session.began.next()
            #expect(rig.events.all == ["probe cleanup", "session begin"])
            await rig.stop(recording)
        }
    }

    @Test func silentRefusedAndMissingOutputBlockBothStartOrigins() async throws {
        try await withComposeFolder { root in
            for event: RecordingEvent in [.userStart, .callStarted] {
                for evidence: AccessEvidence? in [.silent, .refused, nil] {
                    let rig = try await AccessCompositionRig(root: root)
                    if evidence == nil { rig.readings.device.withLock { $0 = nil } }
                    let recording = await rig.recording()
                    let starting = Task { await recording.send(event) }
                    if let evidence { await rig.probe.started.next(); rig.probe.complete(evidence) }
                    await starting.value
                    let state = await recording.state()
                    #expect(state.phase == .idle)
                    #expect(state.missing == [.callAudioAccess])
                    #expect(menuBarRecording(state) == .idle(automatic: true, unavailable: [.callAudio], failure: nil))
                    #expect(!rig.events.all.contains("session begin"))
                    await rig.stop(recording)
                }
            }
        }
    }

    @Test func runningRecordingDoesNotLaunchProbe() async throws {
        try await withComposeFolder { root in
            let rig = try await AccessCompositionRig(root: root)
            let recording = await rig.recording()
            let starting = Task { await recording.send(.userStart) }
            await rig.probe.started.next(); rig.probe.complete(.heard)
            await starting.value; await rig.session.began.next()
            rig.readings.time.withLock { $0 = 131 }
            await rig.conditions.withLock { $0! }.refresh()
            await recording.send(.callStarted)
            #expect(rig.probe.calls.withLock { $0 } == 1)
            #expect(await recording.state().phase != .idle)
            await rig.stop(recording)
        }
    }

    @Test func deferredStartRechecksEvidence() async throws {
        try await withComposeFolder { root in
            for result: AccessEvidence in [.heard, .silent] {
                let rig = try await AccessCompositionRig(root: root, holdEnd: true)
                let recording = await rig.recording()
                let starting = Task { await recording.send(.userStart) }
                await rig.probe.started.next(); rig.probe.complete(.heard)
                await starting.value; await rig.session.began.next()
                await recording.send(.userStop)
                await rig.session.ending.next()
                rig.readings.time.withLock { $0 = 131 }
                await recording.send(.callStarted)
                #expect(await recording.state().pendingCall)
                #expect(rig.probe.calls.withLock { $0 } == 1)
                rig.session.releaseEnd.send()
                await rig.probe.started.next()
                #expect(rig.events.all.last == "session cleanup")
                rig.probe.complete(result)
                for await state in await recording.states() {
                    if result == .heard, state.lastSessionID == 2 { break }
                    if result == .silent, state.phase == .idle { break }
                }
                let state = await recording.state()
                #expect(state.lastSessionID == (result == .heard ? 2 : 1))
                #expect(state.missing.contains(.callAudioAccess) == (result == .silent))
                if result == .heard { await rig.session.began.next() }
                rig.session.releaseEnd.send()
                await rig.stop(recording)
            }
        }
    }

    @Test func startupRefreshPromptsAndInvalidationRemovesMenuAccess() async throws {
        try await withComposeFolder { root in
            let rig = try await AccessCompositionRig(root: root)
            let recording = await rig.recording()
            let launch = Task { await rig.conditions.withLock { $0! }.refresh() }
            await rig.probe.started.next(); rig.probe.complete(.heard)
            await launch.value
            #expect(!(await recording.state().missing.contains(.callAudioAccess)))
            await rig.policy.invalidate()
            for await state in await recording.states() {
                if state.missing.contains(.callAudioAccess) {
                    #expect(menuBarRecording(state) == .idle(automatic: true, unavailable: [.callAudio], failure: nil))
                    break
                }
            }
            #expect(rig.probe.calls.withLock { $0 } == 1)
            await rig.stop(recording)
        }
    }
}

private final class AccessCompositionRig: Sendable {
    let events = Values<String>()
    let readings = AccessReadings()
    let probe: AccessProbeSpy
    let session: AccessSessionSpy
    let model = CallAudioAccessModel()
    let store: PreferencesStore
    let policy: AccessPolicy
    let conditions = Mutex<RecordingConditions?>(nil)

    init(root: URL, holdEnd: Bool = false) async throws {
        probe = AccessProbeSpy(events: events)
        session = AccessSessionSpy(events: events, holdEnd: holdEnd)
        store = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
        try store.write(Preferences(automaticRecording: true, callsFolder: root))
        let model = model, probe = probe, readings = readings
        let readDevice: @Sendable () async -> UInt32? = { readings.device.withLock { $0 } }
        let now: @Sendable () -> Double = { readings.time.withLock { $0 } }
        let handler = AccessEffectHandler(probe: { await probe.measure() }, device: readDevice, now: now, sleep: { _ in throw CancellationError() })
        await model.start(handler: handler, changes: AsyncStream { $0.finish() })
        policy = AccessPolicy(send: { await model.send($0) }, states: { await model.states() }, device: readDevice, now: now)
    }

    func recording() async -> RecordingInputs {
        let (recording, conditions) = await composeRecordingWithPreferences(preferences: store, makePieces: { _ in
            preconditionFailure("The injected Session spy owns captures")
        }, makeConditions: { [policy] recording, _ in
            RecordingConditions(recording: recording, microphoneAccess: { true }, callAudioAccess: { false }, callsFolder: { true }, room: { true }, access: policy)
        }, panel: ReadingClockSpy().panel(), makeModel: { [session] initial, _, log in
            await Audelin.makeRecording(initial: initial, session: session, log: log)
        }, makeSession: makeSession)
        self.conditions.withLock { $0 = conditions }
        return recording
    }

    func stop(_ recording: RecordingInputs) async {
        await recording.send(.userStop)
        for await state in await recording.states() { if state.phase == .idle { break } }
        await recording.end()
        conditions.withLock { $0 = nil }
        await model.end()
    }
}

private final class AccessProbeSpy: Sendable {
    let events: Values<String>
    let started = Signal()
    let calls = Mutex(0)
    let answer = Mutex<CheckedContinuation<AccessEvidence, Never>?>(nil)
    init(events: Values<String>) { self.events = events }
    func measure() async -> AccessEvidence {
        // A cancelled test ends at its own expectations rather than hanging here.
        await withTaskCancellationHandler {
            await withCheckedContinuation { done in
                answer.withLock { $0 = done }; calls.withLock { $0 += 1 }; started.send()
            }
        } onCancel: {
            answer.withLock { let done = $0; $0 = nil; return done }?.resume(returning: .refused)
        }
    }
    func complete(_ evidence: AccessEvidence) {
        events.append("probe cleanup")
        answer.withLock { let done = $0; $0 = nil; return done }?.resume(returning: evidence)
    }
}

private struct AccessSessionSpy: RecordingSession {
    let events: Values<String>
    let holdEnd: Bool
    let began = Signal()
    let ending = Signal()
    let releaseEnd = Signal()
    func begin(id: UInt64) async -> RecordingSessionReport {
        events.append("session begin"); began.send(); return .ready
    }
    func end(id: UInt64) async {
        ending.send()
        if holdEnd { await releaseEnd.next() }
        events.append("session cleanup")
    }
}

private final class AccessReadings: Sendable {
    let device = Mutex<UInt32?>(10)
    let time = Mutex(100.0)
}
