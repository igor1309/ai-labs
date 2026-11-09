import BlockingTestWork
import Darwin
import Foundation
import SummaryRuntime
import Synchronization
import Testing

/// Suspends between reads of the nonblocking descriptor, so a slow child never
/// holds a thread the child's own runner may need.
private func readPID(from fd: Int32) async throws -> Int32 {
    var buffer = [UInt8](repeating: 0, count: 64)
    while true {
        let count = Darwin.read(fd, &buffer, buffer.count)
        if count > 0 {
            guard let pid = Int32(String(decoding: buffer.prefix(count), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)) else { throw CocoaError(.fileReadCorruptFile) }
            return pid
        }
        guard count < 0, errno == EAGAIN else { throw CocoaError(.fileReadUnknown) }
        try await Task.sleep(for: .milliseconds(10))
    }
}

@Suite(.timeLimit(.minutes(1))) struct ProcessRunnerTests {
    /// Contract test: both parent and descendant ignore TERM. Only escalation
    /// directed at the owned group can finish the attempt and its exit witness.
    @Test(arguments: [false, true])
    func timeoutAndCancellationTerminateOwnedDescendants(cancel: Bool) async throws {
        let fixture = try { () throws -> (URL, Int32) in
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
            let fifo = folder.appendingPathComponent("ready")
            guard mkfifo(fifo.path, 0o600) == 0 else { throw CocoaError(.fileWriteUnknown) }
            let fd = open(fifo.path, O_RDWR | O_NONBLOCK | O_CLOEXEC)
            guard fd >= 0 else { throw CocoaError(.fileReadUnknown) }
            return (folder, fd)
        }()
        let events = ProcessEvents(), clock = FakeClock()
        let runner = ProcessRunner(now: clock.now, sleepUntil: clock.sleep(until:), deadline: 120, outputLimit: 4096, observe: { event in
            events.receive(event)
            if case .terminating = event { clock.set(122) }
        })
        let fifo = fixture.0.appendingPathComponent("ready").path
        let child = "trap '' TERM; printf '%s\\n' \"$$\" > '" + fifo + "'; exec /usr/bin/tail -f /dev/null"
        let script = "trap '' TERM; /bin/sh -c " + shellQuote(child) + " & wait"
        let task = Task { try await runner.run(program: "/bin/sh", arguments: ["-c", script], input: Data(repeating: 65, count: 2 * 1024 * 1024)) }
        do {
            let descendant = try await readPID(from: fixture.1)
            let exited = AsyncStream<Void>.makeStream()
            let witness = DispatchSource.makeProcessSource(identifier: descendant, eventMask: .exit, queue: .global())
            witness.setEventHandler { exited.continuation.yield(()); exited.continuation.finish() }
            witness.activate()
            defer { witness.cancel() }
            if cancel { task.cancel() } else { clock.set(120) }
            await #expect(throws: cancel ? Failure.cancelled : Failure.timeout) { try await task.value }
            for await _ in exited.stream { break }
            #expect(witness.data.contains(.exit))
            #expect(events.reaped.withLock { $0 })
        } catch {
            task.cancel()
            _ = await task.result
            _ = close(fixture.1); try? FileManager.default.removeItem(at: fixture.0)
            throw error
        }
        _ = close(fixture.1); try? FileManager.default.removeItem(at: fixture.0)
    }
    /// Contract test: an unrelated open descriptor cannot keep another
    /// attempt's pipes, locks or call files alive in the spawned process.
    @Test func unrelatedOpenDescriptorsAreNotInherited() async throws {
        let descriptor = try {
            let source = open("/dev/null", O_RDONLY)
            guard source >= 0 else { throw CocoaError(.fileReadUnknown) }
            defer { close(source) }
            let duplicate = fcntl(source, F_DUPFD, 200)
            guard duplicate >= 0 else { throw CocoaError(.fileReadUnknown) }
            return duplicate
        }()
        let runner = ProcessRunner(now: { ProcessInfo.processInfo.systemUptime }, deadline: 30, outputLimit: 4096, observe: { _ in })
        do {
            let result = try await runner.run(program: "/bin/cat", arguments: ["/dev/fd/\(descriptor)"], input: Data())
            #expect(result.status != 0)
            _ = close(descriptor)
        } catch {
            _ = close(descriptor)
            throw error
        }
    }
    /// Contract test: real argv/stdin pipes, temporary cwd and awaited process reap.
    @Test func literalInputAndIsolatedDirectory() async throws {
        let input = Data(String(repeating: "$(touch /never) ' ; `id` \n", count: 50000).utf8)
        let runner = ProcessRunner(now: { ProcessInfo.processInfo.systemUptime }, deadline: 30, outputLimit: 4 * 1024 * 1024, observe: { _ in })
        let output = try await runner.run(program: "/bin/cat", arguments: [], input: input)
        #expect(output.stdout == input)
        #expect(output.status == 0)
        let cwd = try await runner.run(program: "/bin/pwd", arguments: [], input: Data())
        let path = String(decoding: cwd.stdout, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        #expect(path.contains("audelin-summary-"))
        #expect(!FileManager.default.fileExists(atPath: path))
    }
    /// Contract test: excessive real process output is terminated and reaped.
    @Test func oversizedOutputKillsAndReapsProcess() async {
        let events = ProcessEvents()
        let runner = ProcessRunner(now: { ProcessInfo.processInfo.systemUptime }, deadline: 30, outputLimit: 4096, observe: events.receive)
        await #expect(throws: Failure.outputLimit) { try await runner.run(program: "/usr/bin/yes", arguments: [], input: Data()) }
        let pid = events.pid.withLock { $0 }
        #expect(pid > 0)
        #expect(events.reaped.withLock { $0 })
        #expect(kill(pid, 0) == -1 && errno == ESRCH)
    }
    /// Contract test: blocked stdin, group termination grace, SIGKILL and reap against a real child.
    @Test func deadlineIncludesBlockedInputAndEscalates() async {
        let events = ProcessEvents(), clock = FakeClock()
        let runner = ProcessRunner(now: clock.now, sleepUntil: clock.sleep(until:), deadline: 120, outputLimit: 4096, observe: { event in
            events.receive(event)
            if case .inputBlocked = event { clock.set(120) }
            if case .terminating = event { clock.set(122) }
        })
        await #expect(throws: Failure.timeout) {
            try await runner.run(program: "/bin/sh", arguments: ["-c", "trap '' TERM; exec /usr/bin/tail -f /dev/null"], input: Data(repeating: 65, count: 2 * 1024 * 1024))
        }
        #expect(events.blocked.withLock { $0 })
        #expect(events.reaped.withLock { $0 })
    }
    /// Contract test: cancellation joins a real process with blocked stdin.
    @Test func cancellationJoinsCleanup() async {
        let events = ProcessEvents(), clock = FakeClock()
        let runner = ProcessRunner(now: clock.now, sleepUntil: clock.sleep(until:), deadline: 120, outputLimit: 4096, observe: { event in
            events.receive(event)
            if case .terminating = event { clock.set(clock.now() + 2) }
        })
        let task = Task { try await runner.run(program: "/usr/bin/tail", arguments: ["-f", "/dev/null"], input: Data(repeating: 65, count: 1024 * 1024)) }
        for await event in events.stream where event == "blocked" { break }
        task.cancel()
        await #expect(throws: Failure.cancelled) { try await task.value }
        #expect(events.reaped.withLock { $0 })
    }
    /// Contract test: stderr is drained while retaining only its configured bound.
    @Test func stderrDrainsBeyondRetainedLimit() async throws {
        let runner = ProcessRunner(now: { ProcessInfo.processInfo.systemUptime }, deadline: 30, outputLimit: 4096, observe: { _ in })
        let result = try await runner.run(program: "/bin/sh", arguments: ["-c", "head -c 131072 /dev/zero >&2; printf complete"], input: Data())
        #expect(result.stderr.count == 65536)
        #expect(String(decoding: result.stdout, as: UTF8.self) == "complete")
    }
}
private func shellQuote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'" }
/// A clock the test moves by hand; a sleeper wakes once the clock reaches its time, or when cancelled.
private final class FakeClock: Sendable {
    private struct Sleeper { let id: UUID, time: Double, wake: CheckedContinuation<Void, Never> }
    private let state = Mutex((time: 0.0, sleepers: [Sleeper]()))
    @Sendable func now() -> Double { state.withLock { $0.time } }
    @Sendable func set(_ time: Double) {
        let due = state.withLock { state in
            state.time = time
            defer { state.sleepers.removeAll { $0.time <= time } }
            return state.sleepers.filter { $0.time <= time }
        }
        for sleeper in due { sleeper.wake.resume() }
    }
    @Sendable func sleep(until time: Double) async {
        let id = UUID()
        await withTaskCancellationHandler {
            await withCheckedContinuation { wake in
                let parked = state.withLock { state in
                    guard state.time < time, !Task.isCancelled else { return false }
                    state.sleepers.append(Sleeper(id: id, time: time, wake: wake))
                    return true
                }
                if !parked { wake.resume() }
            }
        } onCancel: {
            let sleeper = state.withLock { state in
                state.sleepers.firstIndex { $0.id == id }.map { state.sleepers.remove(at: $0) }
            }
            sleeper?.wake.resume()
        }
    }
}
private final class ProcessEvents: Sendable {
    let pid = Mutex<Int32>(0), reaped = Mutex(false), blocked = Mutex(false)
    private let output = AsyncStream<String>.makeStream()
    var stream: AsyncStream<String> { output.stream }
    func receive(_ event: ProcessRunner.Event) {
        switch event {
        case let .launched(id): pid.withLock { $0 = id }
        case .inputBlocked: blocked.withLock { $0 = true }; output.continuation.yield("blocked")
        case .reaped: reaped.withLock { $0 = true }
        case .terminating: break
        }
    }
}
