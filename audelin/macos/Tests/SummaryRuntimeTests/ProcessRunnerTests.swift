import BlockingTestWork
import Darwin
import Foundation
import SummaryRuntime
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct ProcessRunnerTests {
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
        #expect(await offPool { !FileManager.default.fileExists(atPath: path) })
    }
    /// Contract test: excessive real process output is terminated and reaped.
    @Test func oversizedOutputKillsAndReapsProcess() async {
        let events = ProcessEvents()
        let runner = ProcessRunner(now: { ProcessInfo.processInfo.systemUptime }, deadline: 30, outputLimit: 4096, observe: events.receive)
        await #expect(throws: Failure.outputLimit) { try await runner.run(program: "/usr/bin/yes", arguments: [], input: Data()) }
        let pid = events.pid.withLock { $0 }
        #expect(pid > 0)
        #expect(events.reaped.withLock { $0 })
        #expect(await offPool { kill(pid, 0) == -1 && errno == ESRCH })
    }
    /// Contract test: blocked stdin, group termination grace, SIGKILL and reap against a real child.
    @Test func deadlineIncludesBlockedInputAndEscalates() async {
        let events = ProcessEvents(), clock = Mutex(0.0)
        let runner = ProcessRunner(now: { clock.withLock { $0 } }, deadline: 120, outputLimit: 4096, observe: { event in
            events.receive(event)
            if case .inputBlocked = event { clock.withLock { $0 = 120 } }
            if case .terminating = event { clock.withLock { $0 = 122 } }
        })
        await #expect(throws: Failure.timeout) {
            try await runner.run(program: "/bin/sh", arguments: ["-c", "trap '' TERM; exec /usr/bin/tail -f /dev/null"], input: Data(repeating: 65, count: 2 * 1024 * 1024))
        }
        #expect(events.blocked.withLock { $0 })
        #expect(events.reaped.withLock { $0 })
    }
    /// Contract test: cancellation joins a real process with blocked stdin.
    @Test func cancellationJoinsCleanup() async {
        let events = ProcessEvents(), clock = Mutex(0.0)
        let runner = ProcessRunner(now: { clock.withLock { $0 } }, deadline: 120, outputLimit: 4096, observe: { event in
            events.receive(event)
            if case .terminating = event { clock.withLock { $0 += 2 } }
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
