import BlockingTestWork
import CallFolder
import CoreAudioProcesses
import Foundation
import Preferences
import Session
import SessionRehearsal
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SessionOrderTests {
    @Test func portsRejectUnknownIdentities() async throws {
        try await withComposeFolder { root in
            var boundary = rehearsalBoundary(capturePersistence: .recorded,
                microphone: { throw ScriptFailure.failed }, call: { _ in throw ScriptFailure.failed },
                mine: RehearsalRecognizer(SessionRecognizer(name: "mine")),
                theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
                now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
                sleep: { _ in throw CancellationError() }, intervals: testIntervals)
            boundary.processes = FixtureProcesses(binding: CallBinding(fails: false))
            let preferences = await offPool { PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")) }
            try await offPool { try preferences.write(Preferences(callsFolder: root)) }
            let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes),
                                               clock: BoundaryCallClock(time: boundary.time))
            let app = RecordingCallApp()
            app.started("us.zoom.xos")
            let pieces = composeRecordingPieces(preferences: preferences, callApp: app, processes: processes, boundary: boundary)(1)
            await #expect(throws: SessionPieces.Failure.unknownFolder("unknown")) {
                try await pieces.microphoneTrack.open(in: .init(id: "unknown"))
            }
            await #expect(throws: SessionPieces.Failure.unknownSelection("unknown")) {
                try await pieces.callCapture.start(selection: .chosen(.init(id: "unknown")))
            }
            let selection = try await pieces.select()
            await #expect(throws: SessionPieces.Failure.unknownSelection(selection.id + "-other")) {
                try await pieces.callCapture.start(selection: .chosen(.init(id: selection.id + "-other")))
            }
            await processes.stop()
        }
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionReleaseTests {
    @Test func anEndedSessionReleasesItsHandler() async throws {
        let released = AsyncStream<Void>.makeStream()
        try await withComposeFolder { root in
            let fixture = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.log = ReleaseSink { released.continuation.finish() }
            })
            do {
                try await fixture.start()
                try await fixture.stop()
                await fixture.finish()
            } catch { await fixture.finish(); throw error }
        }
        for await _ in released.stream {}
    }
}

private final class ReleaseSink: LogSink {
    private let onRelease: @Sendable () -> Void
    init(onRelease: @escaping @Sendable () -> Void) { self.onRelease = onRelease }
    deinit { onRelease() }
    func write(_ entry: LogEntry) {}
}
