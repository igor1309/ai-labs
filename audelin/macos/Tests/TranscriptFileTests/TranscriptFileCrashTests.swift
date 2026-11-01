import Darwin
import Foundation
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileCrashTests {

    @Test(arguments: ["before", "after"])
    func sigkillAtRenameKeepsExactlyOneWholeTranscript(point: String) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let executable = Bundle(for: TranscriptFileTestBundle.self).bundleURL
                .deletingLastPathComponent().appendingPathComponent("TranscriptFileCrashWriter")
            let command = try await TranscriptCommand(executable, [url.path, point])
            do {
                try await withTaskCancellationHandler {
                    var pending = Data()
                    var lines: [String] = []
                    output: for await bytes in command.output {
                        pending.append(bytes)
                        while let newline = pending.firstIndex(of: 10) {
                            let line = String(decoding: pending[..<newline], as: UTF8.self)
                            pending.removeSubrange(...newline)
                            lines.append(line)
                            if line == "paused \(point)" { break output }
                        }
                    }
                    try Task.checkCancellation()
                    try #require(lines == ["returned 1", "returned 2", "paused \(point)"])
                    command.kill()
                    #expect(await command.finish() == SIGKILL)
                    #expect(command.process.terminationReason == .uncaughtSignal)
                    #expect(try await transcriptText(url) == numberedTranscript(point == "before" ? 2 : 3))
                    let leftovers = try await folderNames(folder).filter { $0 != "transcript.md" }
                    #expect(leftovers.count == (point == "before" ? 1 : 0))
                    let other = folder.appendingPathComponent("another.md")
                    let file = try await TranscriptFile(url: other)
                    try await file.write(numberedSegments(4))
                    await file.close()
                    #expect(try await transcriptText(other) == numberedTranscript(4))
                    #expect(try await transcriptText(url) == numberedTranscript(point == "before" ? 2 : 3))
                } onCancel: {
                    command.kill()
                }
            } catch {
                await command.stop()
                throw error
            }
            await command.stop()
        }
    }

    @Test(arguments: ["truncated", "written"])
    func sigkillWhileRewritingKeepsEveryFinalEntryWhole(point: String) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let lines = try await killedWriterLines(url: url, point: point)
            #expect(lines == ["returned 1", "returned 2", "paused \(point)"])
            let final = "# Transcript\n\n**Me** 00:00:01\nfinal\n\n"
            #expect(try await transcriptText(url)
                == (point == "truncated" ? final : final + "**Them** 00:00:02\n3 theirs settled 3 theirs pending\n"))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    /// Runs the crash writer to the chosen point, kills it there, and returns what it reported.
    private func killedWriterLines(url: URL, point: String) async throws -> [String] {

        let executable = Bundle(for: TranscriptFileTestBundle.self).bundleURL
            .deletingLastPathComponent().appendingPathComponent("TranscriptFileCrashWriter")
        let command = try await TranscriptCommand(executable, [url.path, point])
        do {
            let lines = try await withTaskCancellationHandler {
                var pending = Data()
                var lines: [String] = []
                output: for await bytes in command.output {
                    pending.append(bytes)
                    while let newline = pending.firstIndex(of: 10) {
                        let line = String(decoding: pending[..<newline], as: UTF8.self)
                        pending.removeSubrange(...newline)
                        lines.append(line)
                        if line == "paused \(point)" { break output }
                    }
                }
                try Task.checkCancellation()
                command.kill()
                #expect(await command.finish() == SIGKILL)
                #expect(command.process.terminationReason == .uncaughtSignal)
                return lines
            } onCancel: {
                command.kill()
            }
            await command.stop()
            return lines
        } catch {
            await command.stop()
            throw error
        }
    }
}

private final class TranscriptFileTestBundle: NSObject {}
