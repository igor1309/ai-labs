import CoreAudioProcesses
import Darwin
import Foundation
import PanelUI
import Preferences
import Synchronization
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct RealRecordingTranscriptTests {

    private static let spoken = "The weather is sunny today. Please send the report by Friday. The meeting starts at noon."

    /// Contract test: the app's recording composition, over real Core Audio
    /// capture and the real speech model, writes heard call words to transcript.md.
    @Test func spokenCallAudioReachesTheTranscript() async throws {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let calls = directory.appendingPathComponent("Calls", isDirectory: true)
        try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: true)
        let preferences = PreferencesStore(fileURL: directory.appendingPathComponent("preferences.json"))
        try preferences.write(Preferences(automaticRecording: false, liveText: true, callsFolder: calls))
        let speech = try synthesize(Self.spoken, in: directory)

        let binding = CoreAudioBinding()
        let processes = CoreAudioProcesses(binding: binding, clock: ContinuousCallClock())
        defer { processes.stop() }
        let player = try await play(speech, binding: binding, processes: processes)
        defer { _ = kill(player, SIGKILL) }

        let callApp = RecordingCallApp()
        callApp.started("afplay")
        let panel = AudelinPanel()
        let sessions = RecordingSessions(
            makePieces: composeRecordingPieces(preferences: preferences, callApp: callApp, processes: processes),
            liveText: { preferences.read().liveText }, report: { _, _ in }, panel: panel
        )
        let states = await panel.states()
        #expect(await sessions.begin(id: 1) == .ready)
        for await state in states where Self.heardWords(in: state) { break }
        await sessions.end(id: 1)

        let folders = try FileManager.default.contentsOfDirectory(at: calls, includingPropertiesForKeys: nil)
        let folder = try #require(folders.first)
        let transcript = try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
        #expect(!transcript.contains("No text was heard."), "transcript.md: \(transcript)")
        #expect(Self.containsSpokenWord(transcript), "transcript.md: \(transcript)")
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

    private func synthesize(_ text: String, in directory: URL) throws -> URL {

        let speech = directory.appendingPathComponent("speech.aiff")
        let say = Process()
        say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        say.arguments = ["-o", speech.path, text]
        try say.run()
        say.waitUntilExit()
        try #require(say.terminationStatus == 0, "say must synthesize the speech")
        let size = try FileManager.default.attributesOfItem(atPath: speech.path)[.size] as? NSNumber
        try #require((size?.intValue ?? 0) > 0, "The speech file must contain audio")
        return speech
    }

    /// Starts afplay and returns its pid once Core Audio lists it with audio open,
    /// so the session's selection finds it.
    private func play(_ sound: URL, binding: CoreAudioBinding, processes: CoreAudioProcesses) async throws -> Int32 {

        let pid = Mutex<Int32?>(nil)
        let listed = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        defer { listed.continuation.finish() }
        let inspect: @Sendable () -> Void = {

            guard let target = pid.withLock({ $0 }),
                  (try? processes.processes().contains(where: { $0.pid == target })) == true else { return }
            listed.continuation.yield()
        }
        let listener = try binding.onProcessListChange(inspect)
        defer { listener.cancel() }

        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        player.arguments = [sound.path]
        try player.run()
        pid.withLock { $0 = player.processIdentifier }
        inspect()
        var iterator = listed.stream.makeAsyncIterator()
        _ = await iterator.next()
        return player.processIdentifier
    }
}
