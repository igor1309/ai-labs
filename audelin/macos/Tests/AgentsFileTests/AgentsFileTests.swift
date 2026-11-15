import AgentsFile
import CallFolder
import Foundation
import TagsFile
import Testing

@Suite(.timeLimit(.minutes(1)))
struct AgentsFileTests {

    @Test func theTextIsTheBlockInTheDoc() throws {
        #expect(AgentsFile.text == (try documentedText()))
    }

    @Test func anEmptyRootHasNoFile() throws {
        try withFolder { root in #expect(AgentsFile.presence(in: root) == .absent) }
    }

    @Test func writingLeavesTheDocumentedBytesForTheUserOnly() throws {
        try withFolder { root in
            try AgentsFile.write(in: root)
            let url = root.appendingPathComponent("AGENTS.md")
            #expect(try Data(contentsOf: url) == Data(try documentedText().utf8))
            let mode = try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? Int
            #expect(mode == 0o600)
            #expect(AgentsFile.presence(in: root) == .present)
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == ["AGENTS.md"])
        }
    }

    @Test func anyFileThereCountsAsPresentEvenEmpty() throws {
        try withFolder { root in
            try Data().write(to: root.appendingPathComponent("AGENTS.md"))
            #expect(AgentsFile.presence(in: root) == .present)
        }
    }

    @Test func theUsersOwnFileIsNeverReplaced() throws {
        try withFolder { root in
            let url = root.appendingPathComponent("AGENTS.md")
            try Data("mine".utf8).write(to: url)
            #expect(throws: CocoaError.self) { try AgentsFile.write(in: root) }
            #expect(try String(contentsOf: url, encoding: .utf8) == "mine")
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == ["AGENTS.md"])
        }
    }

    @Test func aDeletedFileIsAbsentAgain() throws {
        try withFolder { root in
            try AgentsFile.write(in: root)
            try FileManager.default.removeItem(at: root.appendingPathComponent("AGENTS.md"))
            #expect(AgentsFile.presence(in: root) == .absent)
        }
    }

    @Test func aReadOnlyRootFailsWithAReasonAndLeavesNothing() throws {
        try withFolder { root in
            try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: root.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path) }
            #expect(throws: POSIXError(.EACCES)) { try AgentsFile.write(in: root) }
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [])
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
            try AgentsFile.write(in: root)
            #expect(AgentsFile.presence(in: root) == .present)
        }
    }

    @Test func aMissingRootIsUnavailableAndNothingIsCreated() throws {
        try withFolder { parent in
            let root = parent.appendingPathComponent("gone")
            #expect(AgentsFile.presence(in: root) == .folderUnavailable)
            #expect(throws: (any Error).self) { try AgentsFile.write(in: root) }
            #expect(!FileManager.default.fileExists(atPath: root.path))
        }
    }

    /// The names the text lists are the ones the writers use.
    @Test func theTextNamesWhatTheWritersWrite() throws {
        try withFolder { root in
            let made = try CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 1_761_314_700) }, timeZone: .gmt,
                                      occupiedNames: { [] }, disk: .system).make(title: "Daily standup")
            try TagsFile.write(["daily"], in: made.url)
            let names = [made.transcriptURL, made.microphoneURL, made.callURL, made.url.appendingPathComponent(TagsFile.name)]
                .map(\.lastPathComponent) + ["summary.md"]
            for name in names { #expect(AgentsFile.text.contains("\n      \(name) "), "\(name) is not in the layout") }
            #expect(made.url.lastPathComponent.wholeMatch(of: /\d{4}\.\d{2}\.\d{2}-\d{4} Daily standup/) != nil)
        }
    }

    private func documentedText() throws -> String {
        let doc = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../docs/agents-md.md").standardized
        let lines = try String(contentsOf: doc, encoding: .utf8).components(separatedBy: "\n")
        let start = try #require(lines.firstIndex(of: "```markdown")) + 1
        let end = try #require(lines[start...].firstIndex(of: "```"))
        return lines[start..<end].joined(separator: "\n") + "\n"
    }

    private func withFolder(_ body: (URL) throws -> Void) throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "AgentsFileTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        try body(folder)
    }
}
