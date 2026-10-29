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
                    for await state in await recording.states() where state.phase == .idle { break }
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
                    if result == .heard, state.lastSessionID == 2, state.phase == .recording { break }
                    if result == .silent, state.phase == .idle { break }
                }
                let state = await recording.state()
                #expect(state.lastSessionID == 2)
                #expect(state.missing.contains(.callAudioAccess) == (result == .silent))
                if result == .heard { await rig.session.began.next() }
                rig.session.releaseEnd.send()
                await rig.stop(recording)
            }
        }
    }

    @Test func heardEvidenceStaysAvailableAfterExpiry() async throws {
        try await withComposeFolder { root in
            let rig = try await AccessCompositionRig(root: root)
            let recording = await rig.recording()
            let launch = Task { await rig.conditions.withLock { $0! }.refresh() }
            await rig.probe.started.next()
            rig.probe.complete(.heard)
            await launch.value
            await rig.timerStarted.next()
            rig.readings.time.withLock { $0 = 130 }
            rig.expiry.send()
            for await state in await rig.policy.states() where !state.ready {
                #expect(state.published)
                break
            }
            await rig.conditions.withLock { $0! }.publishAccess()
            #expect(menuBarRecording(await recording.state()) == .idle(automatic: true, unavailable: [], failure: nil))
            #expect(rig.probe.calls.withLock { $0 } == 1)
            await rig.stop(recording)
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
    let timerStarted = Signal()
    let expiry = Signal()
    let model: CallAudioAccessModel
    let store: PreferencesStore
    let policy: AccessPolicy
    let conditions = Mutex<RecordingConditions?>(nil)

    init(root: URL, holdEnd: Bool = false) async throws {
        probe = AccessProbeSpy(events: events)
        session = AccessSessionSpy(events: events, holdEnd: holdEnd)
        store = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
        try store.write(Preferences(automaticRecording: true, callsFolder: root))
        let probe = probe, readings = readings
        let readDevice: @Sendable () async -> UInt32? = { readings.device.withLock { $0 } }
        let now: @Sendable () -> Double = { readings.time.withLock { $0 } }
        model = CallAudioAccessModel(device: readDevice, now: now)
        let timerStarted = timerStarted, expiry = expiry
        await model.start(probe: { await probe.measure() }, sleep: { _ in
            timerStarted.send()
            await expiry.next()
            try Task.checkCancellation()
        }, changes: AsyncStream { $0.finish() })
        policy = await model.policy()
    }

    func recording() async -> RecordingInputs {
        let (recording, conditions) = await composeRecordingWithPreferences(preferences: store, access: policy, makePieces: { _ in
            preconditionFailure("The injected Session spy owns captures")
        }, makeConditions: { [policy] recording, _ in
            RecordingConditions(recording: recording, microphoneAccess: { true }, callsFolder: { true }, room: { true }, access: policy)
        }, panel: ReadingClockSpy().panel(), makeModel: { [session] initial, _, log, ready, released in
            await Audelin.makeRecording(initial: initial, session: session, log: log,
                                        callAudioReady: ready, callAudioReleased: released)
        }, makeSession: makeSession)
        self.conditions.withLock { $0 = conditions }
        for condition in RecordingCondition.allCases {
            await recording.send(.conditionChanged(condition, available: true))
        }
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
    let results = AsyncStream<AccessEvidence>.makeStream()
    init(events: Values<String>) { self.events = events }
    func measure() async -> AccessEvidence {
        calls.withLock { $0 += 1 }; started.send()
        for await evidence in results.stream { return evidence }
        return .refused
    }
    func complete(_ evidence: AccessEvidence) {
        events.append("probe cleanup")
        results.continuation.yield(evidence)
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
