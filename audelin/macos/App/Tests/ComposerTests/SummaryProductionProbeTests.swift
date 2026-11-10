import BlockingTestWork
import Foundation
import Preferences
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1))) struct SummaryProductionProbeTests {
    /// Contract test: the shipped composition uses its real CLI adapter and durable output with synthetic audio/text.
    @Test func shippedCompositionPublishesFromControlledCLI() async throws {
        try await withComposeFolder { root in
            let program = root.appendingPathComponent("fixture-cli"), input = root.appendingPathComponent("input.txt"), cwd = root.appendingPathComponent("cwd.txt")
            let notes = "## What this was about\n\nSynthetic call\n\n## Key points\n\n- Synthetic spoken entries\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
            let envelope = String(decoding: try JSONSerialization.data(withJSONObject: ["type": "result", "subtype": "success", "is_error": false, "result": notes]), as: UTF8.self)
            let controls = "-p --safe-mode --restricted --tools --strict-mcp-config --mcp-config --no-session-persistence --output-format --max-output-tokens"
            let script = "#!/bin/sh\nif [ \"$1\" = --help ]; then printf '%s' " + quote(controls) + "; exit 0; fi\n/bin/cat > " + quote(input.path) + "\npwd > " + quote(cwd.path) + "\nprintf '%s' " + quote(envelope) + "\n"
            do {
                try Data(script.utf8).write(to: program)
                try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: program.path)
            }
            let slot = NotesPreferences.Runtime(kind: "claudeCLI", model: "fixture-subscription", executable: program.path, endpoint: "", credentialVariable: "")
            let preferences = Preferences(notes: .init(enabled: true, primary: slot, fallback: slot), automaticRecording: false, callsFolder: root)
            let rig = try await ComposeFixture.make(root: root, preferences: preferences)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                try await rig.stop()
                for await statuses in rig.menu.summaryStates() where statuses.values.contains("Итоги готовы") { break }
                let bytes = try String(contentsOf: input, encoding: .utf8)
                #expect(bytes.contains("mine final") && bytes.contains("theirs final"))
                #expect(bytes.hasPrefix(NotesResponse.prompt))
                let path = try String(contentsOf: cwd, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
                #expect(path.contains("audelin-summary-"))
                #expect(!FileManager.default.fileExists(atPath: path))
                let output = try String(contentsOf: rig.folder().appendingPathComponent("summary.md"), encoding: .utf8)
                #expect(output.contains("<!-- audelin-summary:"))
                #expect(output.contains("Synthetic call"))
                #expect(try await transcriptText(of: rig).contains("mine final"))
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
}
private func quote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'" }
