import CoreAudioProcesses
import Foundation
import Synchronization
import Testing

struct CoreAudioBindingTests {

    /// Contract test: Core Audio lists a muted afplay child with audio open.
    @Test func realAfplayWithAudioOpenIsListed() throws {

        let listed = try playingProcess()
        #expect(listed.pid > 0)
        #expect(listed.name == "afplay")
        #expect(!listed.isAudelin)
    }

    /// Contract test: Core Audio names an executable that has no bundle id.
    @Test func realAfplayWithoutBundleIDIsNamedByExecutable() throws {

        let listed = try playingProcess()
        #expect(listed.bundleID == nil)
        #expect(listed.name == "afplay")
    }

    private func playingProcess() throws -> AudioProcess {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let sound = directory.appendingPathComponent("speech.aiff")
        let say = Process()
        say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        say.arguments = ["-o", sound.path, "-r", "80", String(repeating: "Audio process contract. ", count: 30)]
        try say.run()
        say.waitUntilExit()
        #expect(say.terminationStatus == 0)
        let size = try FileManager.default.attributesOfItem(atPath: sound.path)[.size] as? NSNumber
        try #require((size?.intValue ?? 0) > 0, "say must produce audio before afplay can open it")

        let binding = CoreAudioBinding()
        let adapter = CoreAudioProcesses(binding: binding, clock: FakeClock())
        defer { adapter.stop() }
        let pid = Mutex<Int32?>(nil)
        let result = Mutex<AudioProcess?>(nil)
        let arrived = DispatchSemaphore(value: 0)
        let inspect: @Sendable () -> Void = {

            guard let target = pid.withLock({ $0 }),
                  let process = try? adapter.processes().first(where: { $0.pid == target }) else { return }
            result.withLock { $0 = process }
            arrived.signal()
        }
        let listener = try binding.onProcessListChange(inspect)
        defer { listener.cancel() }

        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        player.arguments = ["-v", "0", sound.path]
        try player.run()
        defer {

            if player.isRunning { player.terminate() }
            player.waitUntilExit()
        }
        pid.withLock { $0 = player.processIdentifier }
        inspect()
        let status = arrived.wait(timeout: .now() + 10)
        try #require(status == .success, "Core Audio must report the afplay child")
        return try #require(result.withLock { $0 })
    }
}
