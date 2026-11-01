import BlockingTestWork
import Darwin
import Foundation
import Testing

private final class SessionCrashTestBundle {}

@Suite(.timeLimit(.minutes(1)))
struct SessionCrashTests {

    /// Kills a call through the app's composition while it keeps saving, after
    /// the transcript holds this many final entries. The kill lands wherever
    /// the writer is; `TranscriptFileCrashTests` pins the exact save steps.
    @Test(arguments: [2, 4, 8])
    func sigkillDuringACallKeepsEveryFinalEntryAlreadySaved(finalEntries: Int) async throws {

        try await withComposeFolder { root in
            let url = root.appendingPathComponent("1970.01.01-0000").appendingPathComponent("transcript.md")
            let executable = Bundle(for: SessionCrashTestBundle.self).bundleURL
                .deletingLastPathComponent().appendingPathComponent("SessionCrashWriter")
            let command = try await TestCommand(executable, [root.path])
            do {
                var saved: (finalCount: Int, text: String)?
                var pending = Data()
                output: for await bytes in command.output {
                    pending.append(bytes)
                    while let newline = pending.firstIndex(of: 10) {
                        let line = String(decoding: pending[..<newline], as: UTF8.self)
                        pending.removeSubrange(...newline)
                        let parts = line.split(separator: " ", maxSplits: 2)
                        guard parts.count == 3, parts[0] == "wrote", let count = Int(parts[1]),
                              let data = Data(base64Encoded: String(parts[2])) else { continue }
                        saved = (count, String(decoding: data, as: UTF8.self))
                        if count >= finalEntries { break output }
                    }
                }
                command.kill()
                #expect(await command.finish() == SIGKILL)
                let last = try #require(saved)
                #expect(last.finalCount >= finalEntries)
                let parts = last.text.components(separatedBy: "\n\n")
                try #require(parts.count > last.finalCount)
                let kept = parts[...last.finalCount].joined(separator: "\n\n") + "\n\n"
                let text = try await offPool { try String(contentsOf: url, encoding: .utf8) }
                #expect(text.hasPrefix(kept))
            } catch {
                await command.stop()
                throw error
            }
            await command.stop()
        }
    }
}
