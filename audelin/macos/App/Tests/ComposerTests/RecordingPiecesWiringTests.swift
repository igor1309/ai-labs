import CallDiarizer
import SummaryJobs
import TranscriptFinalization
import BlockingTestWork
import CoreAudioProcesses
import Foundation
import Preferences
import Calls
import Recording
import SessionRehearsal
import Synchronization
import Testing
@testable import Composer

/// What the composed Recording's pieces do, on the boundary an application composes them with.
@Suite(.timeLimit(.minutes(1)))
struct RecordingPiecesWiringTests {

    /// The session's reading feed ends with it even when no transcript opened to close it.
    @Test func aRecordingWhoseTranscriptNeverOpenedStillEnds() async throws {

        try await withPieces(folderFails: true) { rig in
            await rig.recording.send(.userStart)
            _ = await rig.wait { $0.phase == .idle && $0.lastSessionID == 1 }
            #expect(await rig.panel.states().first(where: { _ in true })?.recording == .off)
        }
    }

    @Test func endingARecordingTellsNotesItsCallIsWaitingOnce() async throws {

        try await withPieces { rig in
            let recording = await rig.record()
            #expect(rig.waiting.all.isEmpty)
            await rig.stop()
            #expect(rig.waiting.all.count == 1)
            #expect(recording.callID != nil)
            #expect(rig.waiting.all.map(\.lastPathComponent).compactMap { Calls.id(in: $0, timeZone: .gmt) } == [recording.callID].compactMap { $0 })
        }
    }

    @Test func eachRecordingBuildsItsOwnPieces() async throws {

        try await withPieces { rig in
            _ = await rig.record()
            await rig.stop()
            #expect(rig.microphones.count == 1)
            _ = await rig.record()
            await rig.stop()
            #expect(rig.microphones.count == 2)
        }
    }

    @Test func cannotRecordAndFaultsReachRecording() async throws {

        try await withPieces { rig in
            _ = await rig.record()
            rig.microphones.capture(0).end(throwing: ScriptFailure.failed)
            _ = await rig.wait { $0.faults.contains(.microphone) }
            rig.calls.capture(0).end(throwing: ScriptFailure.failed)
            let failed = await rig.wait { $0.faults == [.microphone, .callAudio] }
            #expect(failed.cannotRecord == "no track can record")
            _ = await rig.wait { $0.phase == .idle }
        }
    }

    /// Audio windows change only the pieces: Recording's log and its own-state feed pass over them.
    @Test func audioWindowsReachNeitherRecordingsLogNorItsOwnStates() async throws {

        try await withPieces { rig in
            let recording = await rig.record()
            let id = recording.session!.id
            var own = await rig.recording.ownStates().makeAsyncIterator()
            _ = await own.next()
            let logged = rig.log.entries.all.filter { $0.category == .recording }.count
            for start in 0..<5 {
                await rig.recording.send(.session(id: id, .microphoneLevel(start: Double(start), end: Double(start) + 1, rms: 0.1)))
            }
            await rig.recording.send(.automaticChanged(!recording.automatic))
            #expect(await own.next()?.automatic == !recording.automatic)
            #expect(rig.log.entries.all.filter { $0.category == .recording }.count == logged + 1)
            #expect(await rig.recording.state().pieces?.audioObservation != recording.pieces?.audioObservation)
            await rig.stop()
        }
    }

    @Test func theLiveTextSwitchReachesTheRecordingsPieces() async throws {

        try await withPieces { rig in
            _ = await rig.record()
            await rig.panel.send(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 1) }
            await rig.stop()
        }
    }
}

/// The same through the menu: a session that follows another owns its switch.
@Suite(.timeLimit(.minutes(1)))
struct FollowingSessionsTests {

    @Test func theLiveTextSwitchReachesOnlyTheSessionNowRecording() async throws {

        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            try await rig.stop()
            try await rig.start()
            await rig.menu.sendPanel(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 2) }
            #expect(!rig.log.entries.all.contains { wants($0, id: 1) })
            try await rig.stop()
            await rig.menu.sendPanel(.switchLiveTextOn)
            #expect(rig.log.entries.all.filter { wants($0, id: 3) }.isEmpty)
        }
    }
}

private func wants(_ entry: LogEntry, id: UInt64) -> Bool {

    entry.message.hasPrefix("state id=\(id) ") && entry.message.contains(" wantedLiveText=true ")
}

/// Counts every capture made, and keeps each so a test can end it.
private final class Captures: Sendable {
    private let made = Values<CaptureScript<CaptureBuffer>>()
    private let stopped = Mutex(0)
    var count: Int { made.all.count }
    var stops: Int { stopped.withLock { $0 } }
    func capture(_ index: Int) -> AsyncThrowingStream<CaptureBuffer, any Error>.Continuation { made.all[index].source.continuation }
    func start() throws -> StartedCapture<CaptureBuffer> {
        let script = CaptureScript<CaptureBuffer>(first: .init(samples: [0.25], sampleRate: 48_000), last: .init(samples: [0.5], sampleRate: 48_000), fails: false)
        made.append(script)
        let started = try script.start()
        return StartedCapture(stream: started.stream, stop: {
            self.stopped.withLock { $0 += 1 }
            try await started.stop()
        })
    }
}

private extension AsyncThrowingStream<CaptureBuffer, any Error>.Continuation {
    func end(throwing error: any Error) { finish(throwing: error) }
}

private struct PiecesRig: Sendable {
    let recording: RecordingInputs
    let panel: AudelinPanel
    let microphones: Captures
    let calls: Captures
    let waiting: Values<URL>
    let log: FixtureLog
}

private extension PiecesRig {
    func wait(until met: (RecordingState) -> Bool) async -> RecordingState {
        for await state in await recording.states() where met(state) { return state }
        return await recording.state()
    }
    /// Starts a recording and waits until it records.
    func record() async -> RecordingState {
        await recording.send(.userStart)
        return await wait { $0.phase == .recording }
    }
    func stop() async {
        await recording.send(.userStop)
        _ = await wait { $0.phase == .idle }
    }
}

private func withPieces(folderFails: Bool = false, _ body: @Sendable (PiecesRig) async throws -> Void) async throws {

    try await withComposeFolder { root in
        let microphones = Captures(), calls = Captures(), waiting = Values<URL>(), log = FixtureLog(), clock = FixtureClock()
        defer { clock.finish() }
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { try microphones.start() }, call: { _ in try calls.start() },
            mine: RehearsalRecognizer(SessionRecognizer(name: "mine")), theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: clock.sleep, intervals: testIntervals)
        boundary.time = clock.time
        boundary.transcripts = FileTranscriptStorage(diarizer: CallDiarizer.unavailable)
        boundary.log = log
        boundary.access = ComposerAccess(refresh: { true }, reserve: { true }, release: {},
                                         states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
        boundary.processes = FixtureProcesses(binding: CallBinding(fails: false))
        let url = root.appendingPathComponent("preferences.json")
        let preferences = try {
            let store = PreferencesStore(fileURL: url)
            // A plain file where the calls folder should be: no call folder, so no transcript, can open.
            let calls = folderFails ? root.appendingPathComponent("calls-file") : root
            if folderFails { try Data().write(to: calls) }
            try store.write(Preferences(liveText: false, callsFolder: calls))
            return store
        }()
        let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes), clock: BoundaryCallClock(time: boundary.time))
        let app = RecordingCallApp()
        app.started("us.zoom.xos")
        let panel = await AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: log, intervals: testIntervals, browser: { nil }, sleep: { _ in })
        let resources = await FinalizationResources()
        let finalization = await TranscriptFinalizationModel(diarizing: FinalizationDiarizing(resources: resources),
            cleanup: FinalizationCleanup(resources: resources), replacement: FinalizationReplacement(resources: resources),
            finals: SessionFinals(resources: resources))
        let recording = await composeRecording(preferences: preferences, occupiedCallNames: { [] }, callApp: app, processes: processes, boundary: boundary,
                                               panel: panel, finalization: finalization, finalizationResources: resources,
                                               summaries: SummaryCallbacks(waiting: { waiting.append($0) }))
        for condition in [RecordingCondition.callAudioAccess, .microphoneAccess, .callsFolder, .room] {
            await recording.send(.conditionChanged(condition, available: true))
        }
        try await body(PiecesRig(recording: recording, panel: panel, microphones: microphones, calls: calls, waiting: waiting, log: log))
        await recording.end()
        await processes.stop()
    }
}

private struct SessionFinals: TranscriptFinalization.FinalTranscripts {
    let resources: FinalizationResources
    func publish(_ finals: [String: TranscriptFinalization.FinalTranscript<SummaryJobs.Job.Entry>]) async {
        for call in finals.keys { await resources.published(call: call) }
    }
}
