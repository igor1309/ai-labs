import Darwin
import Darwin.crt_externs
import Foundation
import Synchronization

/// Uses an owned process group and nonblocking pipes on a dedicated queue. No
/// cooperative thread waits on process I/O, blocked stdin, termination or reap.
public struct ProcessRunner: ProcessRunning {
    public enum Event: Sendable { case launched(Int32), inputBlocked, terminating, reaped(Int32) }
    private let observe: @Sendable (Event) -> Void
    private let now: @Sendable () -> Double
    private let deadline: Double
    private let outputLimit: Int
    public init(now: @escaping @Sendable () -> Double, deadline: Double, outputLimit: Int, observe: @escaping @Sendable (Event) -> Void) {
        self.observe = observe
        self.now = now; self.deadline = deadline; self.outputLimit = outputLimit
    }
    public func run(program: String, arguments: [String], input: Data) async throws -> ProcessOutput {
        let cancelled = Mutex(false)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { done in
                DispatchQueue(label: "audelin.summary.process").async {
                    done.resume(with: Result { try perform(program: program, arguments: arguments, input: input, cancelled: cancelled) })
                }
            }
        } onCancel: { cancelled.withLock { $0 = true } }
    }
    private func perform(program: String, arguments: [String], input: Data, cancelled: borrowing Mutex<Bool>) throws -> ProcessOutput {
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
        posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP))
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
        var offset = 0, out = Data(), err = Data(), exit: Int32 = 0
        var reportedBlockedInput = false
        var openInput = true, openOut = true, openErr = true, reaped = false
        var failure: Failure?, terminating: Double?
        func closeInput() { if openInput { Darwin.close(stdin.1); descriptors.removeAll { $0 == stdin.1 }; openInput = false } }
        func stop(_ reason: Failure) {
            if failure == nil { failure = reason; terminating = now(); kill(-pid, SIGTERM); closeInput(); observe(.terminating) }
        }
        defer {
            kill(-pid, SIGKILL)
            if !reaped { while waitpid(pid, &exit, 0) == -1 && errno == EINTR {} }
        }
        while !reaped || openOut || openErr {
            if cancelled.withLock({ $0 }) { stop(.cancelled) }
            if now() - started >= deadline { stop(.timeout) }
            if let terminating, now() - terminating >= 1 { kill(-pid, SIGKILL) }
            if openInput {
                if offset == input.count { closeInput() }
                else {
                    let written = input.withUnsafeBytes { buffer in Darwin.write(stdin.1, buffer.baseAddress!.advanced(by: offset), min(65536, input.count - offset)) }
                    if written > 0 { offset += written }
                    else if written < 0 && errno == EAGAIN && !reportedBlockedInput {
                        reportedBlockedInput = true; observe(.inputBlocked)
                    } else if written < 0 && errno != EAGAIN && errno != EINTR { closeInput() }
                }
            }
            for (fd, isOut) in [(stdout.0, true), (stderr.0, false)] where isOut ? openOut : openErr {
                var buffer = [UInt8](repeating: 0, count: 16384)
                let count = Darwin.read(fd, &buffer, buffer.count)
                if count > 0 {
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
                    if terminating == nil { terminating = now() }
                }
            }
            if reaped && !openOut && !openErr { break }
            var pollers = [pollfd(fd: openOut ? stdout.0 : -1, events: Int16(POLLIN), revents: 0),
                           pollfd(fd: openErr ? stderr.0 : -1, events: Int16(POLLIN), revents: 0),
                           pollfd(fd: openInput ? stdin.1 : -1, events: Int16(POLLOUT), revents: 0)]
            _ = poll(&pollers, nfds_t(pollers.count), 10)
        }
        if let failure { throw failure }
        let code = (exit & 0x7f) == 0 ? (exit >> 8) & 0xff : 128 + (exit & 0x7f)
        return .init(status: code, stdout: out, stderr: err)
    }
}
