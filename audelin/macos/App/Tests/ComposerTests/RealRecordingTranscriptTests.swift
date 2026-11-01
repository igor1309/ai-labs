import BlockingTestWork
import AVFoundation
import CoreAudioProcesses
import Darwin
import Foundation
import PanelUI
import Preferences
import Testing
@testable import Audelin
@testable import Composer

private let recordingSkipReason: String? = {
    // A hosted CI runner's microphone capture never ends (PR 1262), and it may
    // not tap system audio; this runs in the local test step.
    guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == nil else {
        return "A hosted CI runner cannot record a real call."
    }
    guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
        return "Microphone access is unavailable; tests do not request permission."
    }
    return nil
}()

/// The local gate sets `AUDELIN_REQUIRE_DEVICES=1`: there the suite below must
/// run, so its skip becomes a failure that names what is missing.
@Suite struct RealRecordingTranscriptRequirement {

    @Test(.enabled(if: ProcessInfo.processInfo.environment["AUDELIN_REQUIRE_DEVICES"] == "1"))
    func theRealRecordingTestsCanRun() {

        if let reason = recordingSkipReason { Issue.record(Comment(rawValue: reason)) }
    }
}

@Suite(.serialized, .timeLimit(.minutes(1)), .disabled(
    if: recordingSkipReason != nil,
    Comment(rawValue: recordingSkipReason ?? "A real call can be recorded.")
))
struct RealRecordingTranscriptTests {

    private static let spoken = "The weather is sunny today. Please send the report by Friday. The meeting starts at noon."

    /// Contract test: the app's recording composition, over real Core Audio
    /// capture and the real speech model, writes heard call words to transcript.md.
    @Test func spokenCallAudioReachesTheTranscript() async throws {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try await offPool { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        try await withCleanup {
            let calls = directory.appendingPathComponent("Calls", isDirectory: true)
            try await offPool { try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: true) }
            let preferences = PreferencesStore(fileURL: directory.appendingPathComponent("preferences.json"))
            try preferences.write(Preferences(automaticRecording: false, liveText: true, callsFolder: calls))
            let speech = try await synthesize(Self.spoken, in: directory)

            let binding = CoreAudioBinding()
            let processes = CoreAudioProcesses(binding: binding, clock: ContinuousCallClock())
            let callApp = RecordingCallApp()
            // A name no process has: other suites play their own afplay meanwhile, and
            // selecting one of them by name would leave this call's speech out.
            callApp.started("audelin-test-call-\(UUID().uuidString)")
            let panel = AudelinPanel(makeReading: ReadingStub.inputs)
            let sessions = RecordingSessions(
                makePieces: composeRecordingPieces(preferences: preferences, callApp: callApp, processes: processes),
                liveText: { preferences.read().liveText }, report: { _, _ in }, panel: panel,
                makeSession: makeSession
            )
            let states = await panel.states()
            #expect(await sessions.begin(id: 1) == .ready)
            // The call speaks only once its audio is being recorded; with no process of
            // the call app's, the session hears every app but Audelin, afplay included.
            let player = try await play(speech)
            defer { _ = kill(player, SIGKILL) }
            // Stop waiting once afplay has finished and the recognizer had time to
            // catch up, so a miss fails on the transcript instead of the time limit.
            await withTaskGroup(of: Void.self) { group in
                group.addTask { for await state in states where Self.heardWords(in: state) { break } }
                group.addTask {
                    while kill(player, 0) == 0, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(200)) }
                    try? await Task.sleep(for: .seconds(5))
                }
                await group.next()
                group.cancelAll()
            }
            await sessions.end(id: 1)

            let folders = try await offPool { try FileManager.default.contentsOfDirectory(at: calls, includingPropertiesForKeys: nil) }
            let folder = try #require(folders.first)
            let transcript = try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) }
            #expect(!transcript.contains("No text was heard."), "transcript.md: \(transcript)")
            #expect(Self.containsSpokenWord(transcript), "transcript.md: \(transcript)")
            #expect(transcript.lowercased().contains("weather"), "The first words must be heard: \(transcript)")
        } cleanup: {
            try FileManager.default.removeItem(at: directory)
        }
    }

    private static func heardWords(in state: PanelState) -> Bool {

        guard case let .lines(lines) = state.log else { return false }
        return lines.entries.contains { $0.speaker == .them && containsSpokenWord($0.settled + " " + $0.pending) }
    }

    private static func containsSpokenWord(_ text: String) -> Bool {

        let heard = Set(words(text))
        return words(spoken).contains { $0.count > 3 && heard.contains($0) }
    }

    private static func words(_ text: String) -> [String] {

        text.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init)
    }

    private func synthesize(_ text: String, in directory: URL) async throws -> URL {

        let speech = directory.appendingPathComponent("speech.aiff")
        let say = Process()
        say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        say.arguments = ["-o", speech.path, text]
        try #require(try await exitStatus(of: say) == 0, "say must synthesize the speech")
        let size = try await offPool { (try FileManager.default.attributesOfItem(atPath: speech.path)[.size] as? NSNumber)?.intValue }
        try #require((size ?? 0) > 0, "The speech file must contain audio")
        return speech
    }

    /// Starts afplay and returns its pid.
    private func play(_ sound: URL) async throws -> Int32 {

        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        player.arguments = [sound.path]
        try await offPool { try player.run() }
        return player.processIdentifier
    }
}
