import CoreAudioProcesses
import Foundation
import Recording
import Synchronization
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct RecordingConditionsTests {

    @Test func firstRefreshSendsEveryCondition() async {

        let rig = ConditionsRig()
        rig.available.set(.callAudioAccess, false)
        rig.available.set(.room, false)
        await rig.checker.refresh()
        #expect(rig.events.all == [
            .conditionChanged(.microphoneAccess, available: true),
            .conditionChanged(.callAudioAccess, available: false),
            .conditionChanged(.callsFolder, available: true),
            .conditionChanged(.room, available: false),
        ])
        #expect(rig.reads.all == RecordingCondition.allCases)
    }

    @Test func unchangedRefreshReadsAllAndSendsNothing() async {

        let rig = ConditionsRig()
        await rig.checker.refresh()
        let first = rig.events.all
        await rig.checker.refresh()
        #expect(rig.events.all == first)
        #expect(rig.reads.all == RecordingCondition.allCases + RecordingCondition.allCases)
    }

    @Test func oneChangeSendsOnlyThatCondition() async {

        for condition in RecordingCondition.allCases {
            let rig = ConditionsRig()
            await rig.checker.refresh()
            let first = rig.events.all
            rig.available.set(condition, false)
            await rig.checker.refresh()
            #expect(rig.events.all == first + [.conditionChanged(condition, available: false)])
        }
    }

    @Test func returningConditionIsSentAsAvailable() async {

        for condition in RecordingCondition.allCases {
            let rig = ConditionsRig()
            rig.available.set(condition, false)
            await rig.checker.refresh()
            let first = rig.events.all
            rig.available.set(condition, true)
            await rig.checker.refresh()
            #expect(rig.events.all == first + [.conditionChanged(condition, available: true)])
        }
    }

    @Test func refreshRunsBeforeEachCallStartReachesRecording() async throws {

        let session = ConditionsSession()
        let recording = await composedRecording(session: session, initial: .init(automatic: true))
        let allowed = Mutex(true)
        let refreshes = Values<Bool>()
        let checker = RecordingConditions(
            recording: recording, microphoneAccess: { allowed.withLock { $0 } },
            callAudioAccess: { true }, callsFolder: { true }, room: { true }
        )
        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        let forwarding = CallRecordingSubscription(calls: source.stream, recording: recording, beforeCallStarted: {
            refreshes.append(true)
            await checker.refresh()
        })
        defer { source.continuation.finish() }
        source.continuation.yield(.started(app: "meeting"))
        for await state in await recording.states() {
            if state.callOn {
                #expect(state.missing.isEmpty)
                #expect(state.session == .init(id: 1, origin: .call))
                break
            }
        }
        source.continuation.yield(.ended(app: "meeting"))
        for await state in await recording.states() {
            if state.phase == .idle && !state.callOn { break }
        }
        allowed.withLock { $0 = false }
        source.continuation.yield(.started(app: "next meeting"))
        for await state in await recording.states() {
            if state.callOn {
                #expect(state.missing == [.microphoneAccess])
                #expect(state.phase == .idle)
                #expect(state.session == nil)
                break
            }
        }
        source.continuation.finish()
        await forwarding.wait()
        #expect(refreshes.all == [true, true])
        let ended = await recording.state()
        #expect(!ended.callOn)

        // A new detector starts with the last unavailable value still in Recording.
        allowed.withLock { $0 = true }
        let processes = CoreAudioProcesses(binding: ConditionsCallBinding(), clock: ConditionsCallClock())
        let composed = try composeCalls(processes, to: recording, conditions: checker)
        defer { processes.stop() }
        for await state in await recording.states() {
            if state.callOn {
                #expect(state.missing.isEmpty)
                #expect(state.session == .init(id: 2, origin: .call))
                break
            }
        }
        processes.stop()
        await composed.wait()
        for await state in await recording.states() {
            if state.phase == .idle && !state.callOn { break }
        }
        await recording.end()
    }

    @Test func missingFolderHasNoRoomWithoutReadingCapacity() async throws {

        try await withComposeFolder { root in
            let reads = Values<URL>()
            let missing = root.appendingPathComponent("missing")
            let room = callsFolderHasRoom(at: missing, availableCapacity: { url in
                reads.append(url)
                return 30_000_000_000
            })
            #expect(!room)
            #expect(reads.all.isEmpty)
        }
    }

    @Test func roomRequiresAtLeastThirtyDecimalGigabytes() async throws {

        try await withComposeFolder { folder in
            for (bytes, expected): (Int64?, Bool) in [
                (nil, false), (0, false), (29_999_999_999, false),
                (30_000_000_000, true), (30_000_000_001, true),
            ] {
                let room = callsFolderHasRoom(at: folder, availableCapacity: { url in
                    #expect(url == folder)
                    return bytes
                })
                #expect(room == expected)
            }
        }
    }
}

private struct ConditionsRig {

    let available = ConditionsAvailability()
    let events = Values<RecordingEvent>()
    let reads = Values<RecordingCondition>()
    let checker: RecordingConditions

    init() {

        let available = available, reads = reads
        let read: @Sendable (RecordingCondition) -> Bool = { condition in
            reads.append(condition)
            return available.get(condition)
        }
        checker = RecordingConditions(
            send: events.append,
            microphoneAccess: { read(.microphoneAccess) }, callAudioAccess: { read(.callAudioAccess) },
            callsFolder: { read(.callsFolder) }, room: { read(.room) }, sink: SystemLogSink()
        )
    }
}

private final class ConditionsAvailability: Sendable {

    private let values = Mutex(Dictionary(uniqueKeysWithValues: RecordingCondition.allCases.map { ($0, true) }))

    func set(_ condition: RecordingCondition, _ available: Bool) {

        values.withLock { $0[condition] = available }
    }

    func get(_ condition: RecordingCondition) -> Bool {

        values.withLock { $0[condition] == true }
    }
}

private struct ConditionsSession: RecordingSession {

    func begin(id: UInt64) async -> RecordingSessionReport { .ready }
    func end(id: UInt64) async {}
}

private struct ConditionsCallBinding: ProcessBinding {

    func processObjects() throws -> [ProcessObject] { [1] }
    func pid(of object: ProcessObject) -> Int32? { 42 }
    func bundleID(of object: ProcessObject) -> String? { "us.zoom.xos" }
    func name(of object: ProcessObject) -> String { "meeting" }
    func isRunningInput(_ object: ProcessObject) -> Bool { true }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation { Cancellation {} }
    func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation { Cancellation {} }
}

private struct ConditionsCallClock: CallClock {

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        Issue.record("A continuously active call must not schedule an end")
        return Cancellation {}
    }
}
