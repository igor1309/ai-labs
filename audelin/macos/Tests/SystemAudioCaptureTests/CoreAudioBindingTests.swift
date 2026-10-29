import AVFAudio
import CoreAudio
import Foundation
import Testing
@testable import SystemAudioCapture

// A hosted CI runner cannot be granted the permission to tap system audio, so
// these run where the tests' own machine can: the local test step.
@Suite(.serialized, .disabled(if: ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil, "needs a Mac that may tap system audio"))
struct CoreAudioBindingTests {

    /// Contract test: a Core Audio tap hears a faint afplay child's tone.
    @Test func realFaintAfplayToneIsHeard() async throws {

        try await withPlayer { pid in
            let capture = try await start(pid)
            defer { capture.stop() }
            try await hearToneAndStop(capture)
        }
    }

    /// Contract test: stopping a native tap ends its stream after its audio.
    @Test func realCaptureStopsAndEndsItsAudio() async throws {

        try await withPlayer { pid in
            let capture = try await start(pid)
            defer { capture.stop() }
            try await hearToneAndStop(capture)
            await #expect(throws: CaptureError.stopped) { try await capture.name(.only([pid])) }
        }
    }

    /// Contract test: native tap resources permit a second capture after stop.
    @Test func realCaptureCanFollowAStoppedCapture() async throws {

        try await withPlayer { pid in
            let binding = CoreAudioBinding()
            let first = try await start(pid, binding: binding)
            defer { first.stop() }
            try await hearToneAndStop(first)
            let second = try await start(pid, binding: binding)
            defer { second.stop() }
            try await hearToneAndStop(second)
        }
    }

    func start(
        _ pid: Int32, binding: CoreAudioBinding = CoreAudioBinding(),
        pause: () async throws -> Void = { try await Task.sleep(for: .milliseconds(20)) },
        now: () -> ContinuousClock.Instant = { .now }
    ) async throws -> SystemAudioCapture {

        // The child has no audio process object until afplay opens the file.
        // The deadline only guards a hang: on a loaded machine afplay can take
        // well over five seconds to open its file.
        let deadline = now() + .seconds(30)
        var object: UInt32?
        repeat {
            object = try? binding.processObject(pid)
            if object != nil { break }
            try await pause()
        } while now() < deadline
        _ = try #require(object, "Core Audio must expose the afplay child's audio process")
        // The child's audio object can exist before a tap can take it.
        while true {
            do {
                return try await SystemAudioCapture(binding: binding, processes: .only([pid]))
            } catch let error as NSError where error.domain == NSOSStatusErrorDomain
                && error.code == Int(kAudioHardwareBadObjectError) {
                guard now() < deadline else { throw error }
                try await pause()
                guard now() < deadline else { throw error }
            }
        }
    }

    private func hearToneAndStop(_ capture: SystemAudioCapture) async throws {

        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                var heard = false
                for try await piece in capture.audio {
                    if magnitude(piece.samples, frequency: 440, rate: piece.sampleRate) > 0.001 {
                        #expect(piece.sampleRate > 0)
                        heard = true
                        capture.stop()
                    }
                }
                #expect(heard, "The captured 440 Hz tone must be above the noise floor")
            }
            group.addTask {
                try await Task.sleep(for: .seconds(30))
                throw ToneTimedOut()
            }
            defer { group.cancelAll() }
            try await group.next()
        }
    }

    @Test func endingAPlayerThatIgnoresTerminateIsBounded() async throws {

        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/bin/sh")
        player.arguments = ["-c", "trap '' TERM; sleep 60"]
        try player.run()
        try await Task.sleep(for: .milliseconds(200))
        let started = ContinuousClock.now
        await Self.end(player)
        #expect(ContinuousClock.now - started < .seconds(10))
        let deadline = ContinuousClock.now + .seconds(5)
        while kill(player.processIdentifier, 0) == 0, ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(kill(player.processIdentifier, 0) != 0, "A player still running past the bound must be killed")
    }

    private func withPlayer(_ body: (Int32) async throws -> Void) async throws {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let sound = directory.appendingPathComponent("tone.wav")
        try writeTone(to: sound)
        let player = Process()
        player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        // A tap hears the process after its own volume, so the tone plays faintly, not at 0.
        player.arguments = ["-v", "0.02", sound.path]
        try player.run()
        do {
            try await body(player.processIdentifier)
        } catch {
            await Self.end(player)
            throw error
        }
        await Self.end(player)
    }

    /// Never blocks on waitUntilExit: a lost termination notice hung a runner for good.
    /// The player counts as gone once its pid is, even if Process never noticed.
    static func end(_ player: Process) async {

        let pid = player.processIdentifier
        if player.isRunning { player.terminate() }
        let deadline = ContinuousClock.now + .seconds(5)
        while player.isRunning, kill(pid, 0) == 0, ContinuousClock.now < deadline {
            try? await Task.sleep(for: .milliseconds(20))
        }
        if player.isRunning, kill(pid, 0) == 0 { kill(pid, SIGKILL) }
    }

    private func writeTone(to sound: URL) throws {

        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48_000 * 40))
        buffer.frameLength = buffer.frameCapacity
        let data = try #require(buffer.floatChannelData?[0])
        for index in 0..<Int(buffer.frameLength) {
            data[index] = Float(0.25 * sin(2 * .pi * 440 * Double(index) / 48_000))
        }
        let file = try AVAudioFile(forWriting: sound, settings: format.settings)
        try file.write(from: buffer)
    }
}

private struct ToneTimedOut: Error {}
