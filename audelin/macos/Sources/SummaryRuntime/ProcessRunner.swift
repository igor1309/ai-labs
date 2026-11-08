import Darwin
import Darwin.crt_externs
import Foundation
import Synchronization

/// Spawns the child in a process group of its own, so stopping it also stops
/// anything it started; `Process` cannot do that. Nothing blocks while the child
/// runs: pipes are nonblocking, and a turn that moves no bytes suspends until the
/// kernel reports the pipes or the child's exit, a timer fires, or the caller cancels.
public struct ProcessRunner: ProcessRunning {
    public enum Event: Sendable { case launched(Int32), inputBlocked, terminating, reaped(Int32) }
    private let observe: @Sendable (Event) -> Void
    private let now: @Sendable () -> Double
    private let sleepUntil: @Sendable (Double) async -> Void
    private let deadline: Double
    private let outputLimit: Int
    /// `sleepUntil` returns once `now()` has reached the given time, or when its task is cancelled.
    public init(now: @escaping @Sendable () -> Double,
                sleepUntil: (@Sendable (Double) async -> Void)? = nil,
                deadline: Double, outputLimit: Int, observe: @escaping @Sendable (Event) -> Void) {
        self.observe = observe
        self.now = now; self.deadline = deadline; self.outputLimit = outputLimit
        self.sleepUntil = sleepUntil ?? { time in try? await Task.sleep(for: .seconds(max(0, time - now()))) }
    }
    public func run(program: String, arguments: [String], input: Data) async throws -> ProcessOutput {
        let cancelled = Cancelled(), wakes = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        // Its own task: stopping the child takes waits that the caller's cancellation would cut short.
        let running = Task.detached { try await perform(program: program, arguments: arguments, input: input, cancelled: cancelled, wakes: wakes) }
        return try await withTaskCancellationHandler {
            try await running.value
        } onCancel: { cancelled.flag.withLock { $0 = true }; wakes.continuation.yield() }
    }
    private final class Cancelled: Sendable { let flag = Mutex(false) }
    private func perform(program: String, arguments: [String], input: Data, cancelled: Cancelled,
                         wakes: (stream: AsyncStream<Void>, continuation: AsyncStream<Void>.Continuation)) async throws -> ProcessOutput {
        let started = now()
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-summary-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }
        var descriptors: [Int32] = []
        func makePipe() throws -> (Int32, Int32) {
            var ends: [Int32] = [-1, -1]
            guard pipe(&ends) == 0 else { throw Failure.unavailable }
            descriptors += ends
            return (ends[0], ends[1])
        }
        defer { for fd in descriptors { Darwin.close(fd) } }
        let stdin = try makePipe(), stdout = try makePipe(), stderr = try makePipe()
        var actions: posix_spawn_file_actions_t?
        posix_spawn_file_actions_init(&actions)
        defer { posix_spawn_file_actions_destroy(&actions) }
        posix_spawn_file_actions_adddup2(&actions, stdin.0, STDIN_FILENO)
        posix_spawn_file_actions_adddup2(&actions, stdout.1, STDOUT_FILENO)
        posix_spawn_file_actions_adddup2(&actions, stderr.1, STDERR_FILENO)
        for fd in descriptors { posix_spawn_file_actions_addclose(&actions, fd) }
        posix_spawn_file_actions_addchdir(&actions, directory.path)
        var attributes: posix_spawnattr_t?
        posix_spawnattr_init(&attributes)
        defer { posix_spawnattr_destroy(&attributes) }
        // Only the explicit standard-stream duplications cross the spawn
        // boundary; concurrent jobs must not inherit one another's pipe ends.
        posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP | POSIX_SPAWN_CLOEXEC_DEFAULT))
        posix_spawnattr_setpgroup(&attributes, 0)
        let argv = ([program] + arguments).map { strdup($0) } + [nil]
        defer { for string in argv { free(string) } }
        var pid: pid_t = 0
        let status = argv.withUnsafeBufferPointer { args in
            posix_spawn(&pid, program, &actions, &attributes, UnsafeMutablePointer(mutating: args.baseAddress!), _NSGetEnviron().pointee)
        }
        guard status == 0 else { throw Failure.unavailable }
        observe(.launched(pid))
        for fd in [stdin.0, stdout.1, stderr.1] { Darwin.close(fd); descriptors.removeAll { $0 == fd } }
        for fd in [stdin.1, stdout.0, stderr.0] { _ = fcntl(fd, F_SETFL, O_NONBLOCK) }
        // A closed child input must fail this write, not deliver SIGPIPE to the app.
        _ = fcntl(stdin.1, F_SETNOSIGPIPE, 1)
        // One kqueue reports pipe readiness and the child's exit; edge-triggered, so
        // the source drains it and the loop takes one turn per report.
        let queue = kqueue()
        guard queue >= 0 else { kill(-pid, SIGKILL); while waitpid(pid, nil, 0) == -1 && errno == EINTR {}; throw Failure.unavailable }
        func watch(_ ident: Int32, _ filter: Int32, _ fflags: UInt32 = 0) {
            var change = kevent(ident: UInt(ident), filter: Int16(filter), flags: UInt16(EV_ADD | EV_CLEAR), fflags: fflags, data: 0, udata: nil)
            // A child already gone fails its exit watch; the first turn's waitpid reaps it.
            _ = kevent(queue, &change, 1, nil, 0, nil)
        }
        watch(stdout.0, EVFILT_READ); watch(stderr.0, EVFILT_READ); watch(stdin.1, EVFILT_WRITE)
        watch(pid, EVFILT_PROC, UInt32(NOTE_EXIT))
        let reports = DispatchSource.makeReadSource(fileDescriptor: queue, queue: .global())
        reports.setEventHandler {
            var drained = Array(repeating: kevent(ident: 0, filter: 0, flags: 0, fflags: 0, data: 0, udata: nil), count: 8), zero = timespec()
            while kevent(queue, nil, 0, &drained, Int32(drained.count), &zero) > 0 {}
            wakes.continuation.yield()
        }
        reports.setCancelHandler { Darwin.close(queue) }
        reports.activate()
        let sleepUntil = sleepUntil
        let deadlineWake = Task { await sleepUntil(started + deadline); wakes.continuation.yield() }
        var graceWake: Task<Void, Never>?
        defer { reports.cancel(); deadlineWake.cancel(); graceWake?.cancel() }
        var wake = wakes.stream.makeAsyncIterator()
        var offset = 0, out = Data(), err = Data(), exit: Int32 = 0
        var reportedBlockedInput = false
        var openInput = true, openOut = true, openErr = true, reaped = false
        var failure: Failure?, terminating: Double?
        func closeInput() { if openInput { Darwin.close(stdin.1); descriptors.removeAll { $0 == stdin.1 }; openInput = false } }
        func beginGrace() {
            let since = now()
            terminating = since
            graceWake = Task { await sleepUntil(since + 1); wakes.continuation.yield() }
        }
        func stop(_ reason: Failure) {
            if failure == nil { failure = reason; beginGrace(); kill(-pid, SIGTERM); closeInput(); observe(.terminating) }
        }
        defer {
            kill(-pid, SIGKILL)
            if !reaped { while waitpid(pid, &exit, 0) == -1 && errno == EINTR {} }
        }
        while !reaped || openOut || openErr {
            if cancelled.flag.withLock({ $0 }) { stop(.cancelled) }
            var moved = false
            if now() - started >= deadline { stop(.timeout) }
            if let terminating, now() - terminating >= 1 { kill(-pid, SIGKILL) }
            if openInput {
                if offset == input.count { closeInput() }
                else {
                    let written = input.withUnsafeBytes { buffer in Darwin.write(stdin.1, buffer.baseAddress!.advanced(by: offset), min(65536, input.count - offset)) }
                    if written > 0 { offset += written; moved = true }
                    else if written < 0 && errno == EAGAIN && !reportedBlockedInput {
                        reportedBlockedInput = true; observe(.inputBlocked)
                    } else if written < 0 && errno != EAGAIN && errno != EINTR { closeInput() }
                }
            }
            for (fd, isOut) in [(stdout.0, true), (stderr.0, false)] where isOut ? openOut : openErr {
                var buffer = [UInt8](repeating: 0, count: 16384)
                let count = Darwin.read(fd, &buffer, buffer.count)
                if count > 0 {
                    moved = true
                    if isOut {
                        if out.count + count > outputLimit { stop(.outputLimit) }
                        else { out.append(contentsOf: buffer.prefix(count)) }
                    } else if err.count < 65536 { err.append(contentsOf: buffer.prefix(min(count, 65536 - err.count))) }
                } else if count == 0 || count < 0 && errno != EAGAIN && errno != EINTR {
                    if isOut { openOut = false } else { openErr = false }
                }
            }
            if !reaped {
                let result = waitpid(pid, &exit, WNOHANG)
                if result == pid {
                    reaped = true; observe(.reaped(pid)); closeInput(); kill(-pid, SIGTERM)
                    if terminating == nil { beginGrace() }
                }
            }
            if reaped && !openOut && !openErr { break }
            if !moved { _ = await wake.next() }
        }
        if let failure { throw failure }
        let code = (exit & 0x7f) == 0 ? (exit >> 8) & 0xff : 128 + (exit & 0x7f)
        return .init(status: code, stdout: out, stderr: err)
    }
}
