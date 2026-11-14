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

/// What each Recording id gets from `RecordingSessions`, through the adapter's
/// own entry, on the boundary an application composes it with.
@Suite(.timeLimit(.minutes(1)))
struct RecordingSessionsTests {

    @Test func endingAnUnknownOrFinishedIdReturnsWithoutBuilding() async throws {

        try await withSessions { rig in
            await rig.sessions.end(id: 99)
            #expect(rig.microphones.count == 0)
            await rig.recording(1)
            await rig.sessions.end(id: 1)
            let stops = rig.microphones.stops
            await rig.sessions.end(id: 1)
            #expect(rig.microphones.count == 1)
            #expect(rig.microphones.stops == stops)
        }
    }

    /// The session's reading feed ends with it even when no transcript opened to close it.
    @Test func aRecordingWhoseTranscriptNeverOpenedStillEnds() async throws {

        try await withSessions(folderFails: true) { rig in
            await rig.sessions.begin(id: 3)
            await rig.sessions.end(id: 3)
            #expect(await rig.panel.states().first(where: { _ in true })?.recording == .off)
        }
    }

    @Test func endingARecordingTellsNotesItsCallIsWaitingOnce() async throws {

        try await withSessions { rig in
            await rig.recording(4)
            #expect(rig.waiting.all.isEmpty)
            await rig.sessions.end(id: 4)
            let created = Set(rig.statuses.all.compactMap(\.status.callID))
            #expect(created.count == 1)
            #expect(rig.waiting.all.count == 1)
            #expect(rig.waiting.all.map(\.lastPathComponent).compactMap { Calls.id(in: $0, timeZone: .gmt) } == Array(created))
        }
    }

    @Test func repeatingABeginAnswersFromTheSameSession() async throws {

        try await withSessions { rig in
            await rig.recording(12)
            await rig.recording(12)
            #expect(rig.microphones.count == 1)
            await rig.sessions.end(id: 12)
        }
    }

    @Test func cannotRecordAndFaultsReachRecordingAsStatus() async throws {

        try await withSessions { rig in
            await rig.recording(7)
            rig.microphones.capture(0).end(throwing: ScriptFailure.failed)
            rig.calls.capture(0).end(throwing: ScriptFailure.failed)
            await rig.statuses.wait { $0.id == 7 && $0.status.cannotRecord == "no track can record" }
            await rig.sessions.end(id: 7)
            #expect(rig.statuses.all.filter { $0.id == 7 }.reduce(into: Set()) { $0.formUnion($1.status.faults) } == [.microphone, .callAudio])
            #expect(rig.reports.all.map(\.id) == [7])
        }
    }

    @Test func overlappingSessionsKeepTheirReportsAndSwitchesToThemselves() async throws {

        try await withSessions { rig in
            await rig.recording(1)
            await rig.panel.send(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 1) }

            await rig.recording(2)
            rig.microphones.capture(0).end(throwing: ScriptFailure.failed)
            await rig.statuses.wait { $0.id == 1 && $0.status.faults.contains(.microphone) }
            #expect(!rig.log.entries.all.contains { wants($0, id: 2) })
            #expect(!rig.statuses.all.contains { $0.id == 2 && !$0.status.faults.isEmpty })

            // The panel follows the session begun last, whichever ends first.
            await rig.panel.send(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 2) }
            rig.microphones.capture(1).end(throwing: ScriptFailure.failed)
            await rig.statuses.wait { $0.id == 2 && $0.status.faults.contains(.microphone) }
            await rig.sessions.end(id: 1)
            await rig.sessions.end(id: 2)
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

private struct Reported: Equatable, Sendable {
    let id: UInt64
    let report: RecordingSessionReport
}

private struct Status: Equatable, Sendable {
    let id: UInt64
    let status: RecordingSessionStatus
}

private final class Statuses: Sendable {
    private let stored = Values<Status>()
    private let arrival = Signal()
    var all: [Status] { stored.all }
    func append(_ id: UInt64, _ status: RecordingSessionStatus) { stored.append(.init(id: id, status: status)); arrival.send() }
    func wait(until met: (Status) -> Bool) async {
        if stored.all.contains(where: met) { return }
        for await _ in arrival.stream where stored.all.contains(where: met) { return }
    }
    func end() { arrival.end() }
}

private final class Reports: Sendable {
    private let stored = Values<Reported>()
    private let arrival = Signal()
    var all: [Reported] { stored.all }
    func append(_ value: Reported) { stored.append(value); arrival.send() }
    func wait(for value: Reported) async {
        for await _ in arrival.stream where stored.all.contains(value) { return }
    }
    func end() { arrival.end() }
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

private struct SessionsRig: Sendable {
    let sessions: RecordingSessions
    let panel: AudelinPanel
    let microphones: Captures
    let calls: Captures
    let reports: Reports
    let waiting: Values<URL>
    let statuses: Statuses
    let log: FixtureLog
}

private extension SessionsRig {
    /// Begins the session and waits until it records.
    func recording(_ id: UInt64) async {
        await sessions.begin(id: id)
        await statuses.wait { $0.id == id && $0.status.recording }
    }
}

private func withSessions(folderFails: Bool = false, _ body: @Sendable (SessionsRig) async throws -> Void) async throws {

    try await withComposeFolder { root in
        let microphones = Captures(), calls = Captures(), reports = Reports(), waiting = Values<URL>(), statuses = Statuses(), log = FixtureLog(), clock = FixtureClock()
        defer { reports.end(); statuses.end(); clock.finish() }
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { try microphones.start() }, call: { _ in try calls.start() },
            mine: RehearsalRecognizer(SessionRecognizer(name: "mine")), theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: clock.sleep, intervals: testIntervals)
        boundary.time = clock.time
        boundary.transcripts = FileTranscriptStorage(diarizer: CallDiarizer.unavailable)
        boundary.log = log
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
        let sessions = RecordingSessions(preferences: preferences, occupiedCallNames: { [] }, callApp: app, processes: processes, boundary: boundary,
                                         report: { id, report in reports.append(.init(id: id, report: report)) },
                                         status: { id, status in statuses.append(id, status) }, panel: panel, finalization: finalization, finalizationResources: resources,
                                         summaries: SummaryCallbacks(waiting: { waiting.append($0) }))
        try await body(SessionsRig(sessions: sessions, panel: panel, microphones: microphones, calls: calls, reports: reports, waiting: waiting, statuses: statuses, log: log))
        await processes.stop()
    }
}

private struct SessionFinals: TranscriptFinalization.FinalTranscripts {
    let resources: FinalizationResources
    func publish(_ finals: [String: TranscriptFinalization.FinalTranscript<SummaryJobs.Job.Entry>]) async {
        for call in finals.keys { await resources.published(call: call) }
    }
}
