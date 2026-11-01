import BlockingTestWork
import CoreAudioProcesses
import Foundation
import Preferences
import Recording
import SessionRehearsal
import Synchronization
import Testing
@testable import Composer

/// What each Recording id gets from `RecordingSessions`. Recording never ends
/// an id before it begins it through the menu, so these go in at the adapter's
/// own entry, on the boundary an application composes it with.
@Suite(.timeLimit(.minutes(1)))
struct RecordingSessionsTests {

    @Test func anEndBeforeItsBeginReturnsEndedWithoutBuildingASession() async throws {

        try await withSessions { rig in
            await rig.sessions.end(id: 5)
            #expect(await rig.sessions.begin(id: 5) == .ended)
            #expect(rig.microphones.count == 0)

            // Only that id is spent: the next begins, and the same id's next begin too.
            #expect(await rig.sessions.begin(id: 6) == .ready)
            #expect(rig.microphones.count == 1)
            await rig.sessions.end(id: 6)
            #expect(await rig.sessions.begin(id: 5) == .ready)
            #expect(rig.microphones.count == 2)
            await rig.sessions.end(id: 5)
        }
    }

    @Test func endingAnUnknownOrFinishedIdReturnsWithoutBuilding() async throws {

        try await withSessions { rig in
            await rig.sessions.end(id: 99)
            #expect(rig.microphones.count == 0)
            #expect(await rig.sessions.begin(id: 1) == .ready)
            await rig.sessions.end(id: 1)
            let stops = rig.microphones.stops
            await rig.sessions.end(id: 1)
            #expect(rig.microphones.count == 1)
            #expect(rig.microphones.stops == stops)
        }
    }

    @Test func repeatingABeginAnswersFromTheSameSession() async throws {

        try await withSessions { rig in
            #expect(await rig.sessions.begin(id: 12) == .ready)
            #expect(await rig.sessions.begin(id: 12) == .ready)
            #expect(rig.microphones.count == 1)
            await rig.sessions.end(id: 12)
        }
    }

    @Test func cannotRecordIsReportedOnce() async throws {

        try await withSessions { rig in
            #expect(await rig.sessions.begin(id: 7) == .ready)
            rig.microphones.capture(0).end(throwing: ScriptFailure.failed)
            rig.calls.capture(0).end(throwing: ScriptFailure.failed)
            await rig.reports.wait(for: .init(id: 7, report: .cannotRecord("no track can record")))
            await rig.sessions.end(id: 7)
            #expect(rig.reports.all.filter { if case .cannotRecord = $0.report { true } else { false } }
                    == [.init(id: 7, report: .cannotRecord("no track can record"))])
            let faults = rig.reports.all.filter { if case .failed = $0.report { true } else { false } }
            #expect(faults.count == 2)
            #expect(faults.contains(.init(id: 7, report: .failed(.microphone))))
            #expect(faults.contains(.init(id: 7, report: .failed(.callAudio))))
        }
    }

    @Test func aFaultIsReportedOncePerSessionNotOncePerActor() async throws {

        try await withSessions { rig in
            for (index, id) in [UInt64(21), 34].enumerated() {
                #expect(await rig.sessions.begin(id: id) == .ready)
                rig.microphones.capture(index).end(throwing: ScriptFailure.failed)
                await rig.reports.wait(for: .init(id: id, report: .failed(.microphone)))
                await rig.sessions.end(id: id)
            }
            #expect(rig.reports.all.filter { if case .failed = $0.report { true } else { false } } == [
                .init(id: 21, report: .failed(.microphone)), .init(id: 34, report: .failed(.microphone)),
            ])
        }
    }

    @Test func overlappingSessionsKeepTheirReportsAndSwitchesToThemselves() async throws {

        try await withSessions { rig in
            #expect(await rig.sessions.begin(id: 1) == .ready)
            await rig.panel.send(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 1) }

            #expect(await rig.sessions.begin(id: 2) == .ready)
            rig.microphones.capture(0).end(throwing: ScriptFailure.failed)
            await rig.reports.wait(for: .init(id: 1, report: .failed(.microphone)))
            #expect(!rig.log.entries.all.contains { wants($0, id: 2) })
            #expect(!rig.reports.all.contains(.init(id: 2, report: .failed(.microphone))))

            // The panel follows the session begun last, whichever ends first.
            await rig.panel.send(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 2) }
            rig.microphones.capture(1).end(throwing: ScriptFailure.failed)
            await rig.reports.wait(for: .init(id: 2, report: .failed(.microphone)))
            await rig.sessions.end(id: 1)
            await rig.sessions.end(id: 2)
            #expect(rig.reports.all.filter { if case .failed = $0.report { true } else { false } } == [
                .init(id: 1, report: .failed(.microphone)), .init(id: 2, report: .failed(.microphone)),
            ])
        }
    }
}

/// The same through the menu: a session that follows another owns its switch.
@MainActor
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
    let log: FixtureLog
}

private func withSessions(_ body: @Sendable (SessionsRig) async throws -> Void) async throws {

    try await withComposeFolder { root in
        let microphones = Captures(), calls = Captures(), reports = Reports(), log = FixtureLog(), clock = FixtureClock()
        defer { reports.end(); clock.finish() }
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { try microphones.start() }, call: { _ in try calls.start() },
            mine: RehearsalRecognizer(SessionRecognizer(name: "mine")), theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: clock.sleep, intervals: testIntervals)
        boundary.time = clock.time
        boundary.log = log
        boundary.processes = FixtureProcesses(binding: CallBinding(fails: false))
        let url = root.appendingPathComponent("preferences.json")
        let preferences = try await offPool {
            let store = PreferencesStore(fileURL: url)
            try store.write(Preferences(liveText: false, callsFolder: root))
            return store
        }
        let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes), clock: BoundaryCallClock(time: boundary.time))
        let app = RecordingCallApp()
        app.started("us.zoom.xos")
        let panel = await AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: log, intervals: testIntervals)
        let sessions = RecordingSessions(preferences: preferences, callApp: app, processes: processes, boundary: boundary,
                                         report: { id, report in reports.append(.init(id: id, report: report)) }, panel: panel)
        try await body(SessionsRig(sessions: sessions, panel: panel, microphones: microphones, calls: calls, reports: reports, log: log))
        await processes.stop()
    }
}
