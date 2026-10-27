import AVFAudio
import CoreAudioProcesses
import Darwin
import Foundation
import Synchronization
import Testing

struct CoreAudioBindingTests {

    /// Contract test: Core Audio lists a muted afplay child with audio open.
    @Test func realAfplayWithAudioOpenIsListed() async throws {

        let listed = try await playingProcess()
        #expect(listed.pid > 0)
        #expect(listed.name == "afplay")
        #expect(!listed.isAudelin)
    }

    /// Contract test: Core Audio names an executable that has no bundle id.
    @Test func realAfplayWithoutBundleIDIsNamedByExecutable() async throws {

        let listed = try await playingProcess()
        #expect(listed.bundleID == nil)
        #expect(listed.name == "afplay")
    }

    private func playingProcess() async throws -> AudioProcess {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        // Process discovery needs an open audio file, independent of speech synthesis.
        let sound = directory.appendingPathComponent("tone.wav")
        try writeTone(to: sound)
        let size = try FileManager.default.attributesOfItem(atPath: sound.path)[.size] as? NSNumber
        try #require((size?.intValue ?? 0) > 0, "The fixture must contain audio before afplay can open it")

        let binding = CoreAudioBinding()
        let adapter = CoreAudioProcesses(binding: binding, clock: FakeClock())
        defer { adapter.stop() }
        let pid = Mutex<Int32?>(nil)
        let arrived = AsyncStream<AudioProcess>.makeStream(bufferingPolicy: .bufferingNewest(1))
        defer { arrived.continuation.finish() }
        let inspect: @Sendable () -> Void = {

            guard let target = pid.withLock({ $0 }),
                  let process = try? adapter.processes().first(where: { $0.pid == target }) else { return }
            arrived.continuation.yield(process)
        }
        let listener = try binding.onProcessListChange(inspect)
        defer { listener.cancel() }

        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        player.arguments = ["-v", "0", sound.path]
        try player.run()
        let childPID = player.processIdentifier
        pid.withLock { $0 = childPID }
        inspect()
        let result = await withTaskGroup(of: AudioProcess?.self) { group in
            group.addTask {
                var iterator = arrived.stream.makeAsyncIterator()
                return await iterator.next()
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(18))
                return nil
            }
            defer { group.cancelAll() }
            return await group.next() ?? nil
        }
        let origin = ContinuousClock.now
        try await PlayerShutdown(
            isAlive: { kill(childPID, 0) == 0 || errno != ESRCH },
            terminate: { _ = kill(childPID, SIGTERM) },
            forceKill: { _ = kill(childPID, SIGKILL) },
            now: { origin.duration(to: .now) },
            pause: { try? await Task.sleep(for: .milliseconds(20)) }
        ).stop()
        return try #require(result, "Core Audio must report the afplay child")
    }

    private func writeTone(to sound: URL) throws {

        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48_000 * 40))
        buffer.frameLength = buffer.frameCapacity
        let samples = try #require(buffer.floatChannelData?[0])
        for index in 0..<Int(buffer.frameLength) {
            samples[index] = Float(0.25 * sin(2 * .pi * 440 * Double(index) / 48_000))
        }
        let file = try AVAudioFile(forWriting: sound, settings: format.settings)
        try file.write(from: buffer)
    }
}
