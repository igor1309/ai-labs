import BlockingTestWork
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
        try await offPool { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        defer { afterwards { try? FileManager.default.removeItem(at: directory) } }
        // Process discovery needs an open audio file, independent of speech synthesis.
        let sound = directory.appendingPathComponent("tone.wav")
        try await writeTone(to: sound)
        let size = try await offPool { (try FileManager.default.attributesOfItem(atPath: sound.path)[.size] as? NSNumber)?.intValue }
        try #require((size ?? 0) > 0, "The fixture must contain audio before afplay can open it")

        let binding = CoreAudioBinding()
        let adapter = CoreAudioProcesses(binding: binding, clock: FakeClock())
        // The native listener only signals a change; the list is read by the awaiting task.
        let changed = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        defer { changed.continuation.finish() }
        let inspect: @Sendable () -> Void = { changed.continuation.yield(()) }
        let listener = try await offPool { try binding.onProcessListChange(inspect) }
        defer { listener.cancel() }

        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        player.arguments = ["-v", "0", sound.path]
        try await offPool { try player.run() }
        let childPID = player.processIdentifier
        inspect()
        let result = await withTaskGroup(of: AudioProcess?.self) { group in
            group.addTask {
                for await _ in changed.stream {
                    if let process = try? await adapter.processes().first(where: { $0.pid == childPID }) { return process }
                }
                return nil
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

    private func writeTone(to sound: URL) async throws {

        try await offPool {
            guard let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1),
                  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48_000 * 40),
                  let samples = buffer.floatChannelData?[0]
            else { throw ToneUnavailable() }
            buffer.frameLength = buffer.frameCapacity
            for index in 0..<Int(buffer.frameLength) {
                samples[index] = Float(0.25 * sin(2 * .pi * 440 * Double(index) / 48_000))
            }
            let file = try AVAudioFile(forWriting: sound, settings: format.settings)
            try file.write(from: buffer)
        }
    }
}

private struct ToneUnavailable: Error {}
