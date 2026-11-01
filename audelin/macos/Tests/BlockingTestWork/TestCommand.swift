import Darwin
import Foundation

/// A child process a test can kill, shared by the crash tests. Pipe readiness
/// and child termination report progress without polling.
public final class TestCommand: @unchecked Sendable {

    public let process: Process
    public let output: AsyncStream<Data>
    private let exit: Task<Int32, Never>
    private let pipe: Pipe
    private let input: Pipe

    public init(_ executable: URL, _ arguments: [String]) async throws {

        process = Process()
        process.executableURL = executable
        process.arguments = arguments
        pipe = Pipe()
        input = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        process.standardInput = input
        let bytes = AsyncStream<Data>.makeStream()
        let ended = AsyncStream<Int32>.makeStream()
        output = bytes.stream
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                bytes.continuation.finish()
            } else {
                bytes.continuation.yield(data)
            }
        }
        process.terminationHandler = { process in
            ended.continuation.yield(process.terminationStatus)
            ended.continuation.finish()
        }
        // Launching blocks while the child is spawned, so it happens off the cooperative pool.
        let launching = process
        do { try await offPool { try launching.run() } }
        catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            bytes.continuation.finish()
            ended.continuation.finish()
            throw error
        }
        // Reaping must outlive cancellation of the test that owns this child.
        exit = Task.detached {
            var iterator = ended.stream.makeAsyncIterator()
            return await iterator.next() ?? -1
        }
    }

    public func kill() {

        if process.isRunning { _ = Darwin.kill(process.processIdentifier, SIGKILL) }
    }

    public func finish() async -> Int32 {

        await withTaskCancellationHandler {
            await exit.value
        } onCancel: {
            self.kill()
        }
    }

    public func stop() async {

        kill()
        _ = await finish()
        pipe.fileHandleForReading.readabilityHandler = nil
        await offPool { [self] in
            try? pipe.fileHandleForReading.close()
            try? input.fileHandleForWriting.close()
            try? input.fileHandleForReading.close()
            try? pipe.fileHandleForWriting.close()
        }
    }
}
