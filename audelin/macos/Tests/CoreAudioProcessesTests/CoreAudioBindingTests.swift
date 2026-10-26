import CoreAudioProcesses
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
        let sound = directory.appendingPathComponent("speech.aiff")
        let say = Process()
        say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        say.arguments = ["-o", sound.path, "-r", "80", String(repeating: "Audio process contract. ", count: 30)]
        let speechExit = ProcessExit(say)
        try say.run()
        await speechExit.wait()
        #expect(say.terminationStatus == 0)
        let size = try FileManager.default.attributesOfItem(atPath: sound.path)[.size] as? NSNumber
        try #require((size?.intValue ?? 0) > 0, "say must produce audio before afplay can open it")

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
        let playerExit = ProcessExit(player)
        try player.run()
        pid.withLock { $0 = player.processIdentifier }
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
        if player.isRunning { player.terminate() }
        await playerExit.wait()
        return try #require(result, "Core Audio must report the afplay child")
    }
}

/// Retains an exit delivered before the caller starts awaiting it.
private final class ProcessExit: Sendable {

    private struct State {
        var exited = false
        var waiters: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())

    init(_ process: Process) {

        process.terminationHandler = { [self] _ in
            let waiters = state.withLock {
                $0.exited = true
                let waiters = $0.waiters
                $0.waiters.removeAll()
                return waiters
            }
            for waiter in waiters { waiter.resume() }
        }
    }

    func wait() async {

        await withCheckedContinuation { continuation in
            let exited = state.withLock {
                if $0.exited { return true }
                $0.waiters.append(continuation)
                return false
            }
            if exited { continuation.resume() }
        }
    }
}
