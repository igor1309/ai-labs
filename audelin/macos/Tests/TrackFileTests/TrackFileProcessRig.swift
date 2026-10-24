import Darwin
import Foundation
import Testing

struct CommandResult: Sendable {

    let status: Int32
    let output: String
}

/// Pipe events and process termination end waits without a polling timer.
final class TrackCommand: @unchecked Sendable {

    let process: Process
    let output: AsyncStream<Data>
    private let exit: Task<Int32, Never>
    private let pipe: Pipe
    private let input: Pipe

    init(_ executable: String, _ arguments: [String]) throws {

        process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
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
        do { try process.run() }
        catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            bytes.continuation.finish()
            ended.continuation.finish()
            throw error
        }
        // Reaping remains active when the caller cancels its operation.
        exit = Task.detached {
            var iterator = ended.stream.makeAsyncIterator()
            return await iterator.next() ?? -1
        }
    }

    func kill() {

        if process.isRunning { _ = Darwin.kill(process.processIdentifier, SIGKILL) }
    }

    func finish() async -> Int32 { await exit.value }

    func stop() async {

        kill()
        _ = await finish()
        pipe.fileHandleForReading.readabilityHandler = nil
        try? pipe.fileHandleForReading.close()
        try? input.fileHandleForWriting.close()
    }
}

func runCommand(_ executable: String, _ arguments: [String]) async throws -> CommandResult {

    let command = try TrackCommand(executable, arguments)
    return try await withTaskCancellationHandler {
        var data = Data()
        for await bytes in command.output { data.append(bytes) }
        let status = await command.finish()
        await command.stop()
        try Task.checkCancellation()
        return CommandResult(status: status, output: String(decoding: data, as: UTF8.self))
    } onCancel: {
        command.kill()
    }
}

typealias TrackCommandRunner = @Sendable (String, [String]) async throws -> CommandResult

func withDiskImage(
    in folder: URL, run: @escaping TrackCommandRunner = runCommand,
    _ body: (URL) async throws -> Void
) async throws {

    let image = folder.appendingPathComponent("small.dmg")
    let mount = folder.appendingPathComponent("volume", isDirectory: true)
    try FileManager.default.createDirectory(at: mount, withIntermediateDirectories: false)
    let created = try await run("/usr/bin/hdiutil", [
        "create", "-size", "16m", "-fs", "HFS+", "-type", "UDIF", "-volname", "TrackFileTest", "-o", image.path,
    ])
    try #require(created.status == 0, "\(created.output)")
    let outcome: Result<Void, any Error>
    do {
        let attached = try await run("/usr/bin/hdiutil", [
            "attach", "-nobrowse", "-noautoopen", "-mountpoint", mount.path, image.path,
        ])
        try #require(attached.status == 0, "\(attached.output)")
        try Task.checkCancellation()
        try await body(mount)
        outcome = .success(())
    } catch { outcome = .failure(error) }
    // Attach may mount before reporting cancellation. Detach must finish before
    // the caller removes the folder, independently of that caller's cancellation.
    let cleanup = await Task.detached {
        do { return Result<CommandResult, any Error>.success(try await run("/usr/bin/hdiutil", ["detach", mount.path])) }
        catch { return .failure(error) }
    }.value
    switch cleanup {
    case .success(let result):
        #expect(result.status == 0, "detach failed: \(result.output)")
    case .failure(let error): Issue.record(error)
    }
    try outcome.get()
}
