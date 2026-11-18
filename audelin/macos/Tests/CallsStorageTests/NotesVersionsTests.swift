import CallsStorage
import Foundation
import SummaryFiles
import Synchronization
import Testing
@testable import Calls

@Suite(.timeLimit(.minutes(1))) struct NotesVersionsTests {
    private let first = "1970.01.01-0000", second = "1970.01.01-0001"

    @Test func bothVersionsMoveAndRemainOneCallWithItsTranscript() async throws {
        try await withStorageFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let folder = source.appendingPathComponent(first)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            let transcript = Data("saved transcript".utf8)
            try transcript.write(to: folder.appendingPathComponent("transcript.md"))
            let storage = makeStorage(folder: source)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            try await seedPair(first, folder: folder, files: files)
            let pair = try #require(try await files.versions(call: first))
            #expect(pair.previous?.text == "Previous" && pair.current.text == "Current")
            #expect(try await storage.list().map(\.id) == [first])
            #expect(try await storage.savedTranscript(id: first) == transcript)
            _ = try await storage.move(id: first, to: destination)
            #expect(try await files.versions(call: first) == pair)
            #expect(try await sameDirectory(storage.location(id: first), destination.appendingPathComponent(first, isDirectory: true)))
            #expect(try await storage.list().map(\.id) == [first])
            #expect(try await storage.savedTranscript(id: first) == transcript)
            #expect(!FileManager.default.fileExists(atPath: folder.path))
        }
    }

    @Test func mergedCallHasNeitherPartsNotes() async throws {
        try await withStorageFolder { root in
            let storage = makeStorage(folder: root)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            for id in [first, second] {
                let folder = root.appendingPathComponent(id)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try Data("transcript".utf8).write(to: folder.appendingPathComponent("transcript.md"))
                try Data().write(to: folder.appendingPathComponent("call.caf"))
                try await seedPair(id, folder: folder, files: files)
            }
            #expect(try await storage.merge(ids: [first, second]) { merged, _ in
                try Data("joined".utf8).write(to: merged.appendingPathComponent("transcript.md"))
            } == first)
            #expect(try await files.versions(call: first) == nil)
            #expect(try await storage.savedTranscript(id: first) == Data("joined".utf8))
            #expect(try await storage.list().map(\.id) == [first])
        }
    }

    @Test func publicationRequestedInsideRenameUsesTheNewFolder() async throws {
        try await withStorageFolder { root in
            let folder = root.appendingPathComponent(first)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let attempt = Record(job: "job", call: first, input: "input", snapshot: Data(), phase: "pending")
            let publishing = Mutex<Task<Void, any Error>?>(nil)
            let owner = Mutex<Files?>(nil)
            defer { owner.withLock { $0 = nil } }
            var disk = CallsDisk.system
            let rename = disk.rename
            disk.rename = { from, to in
                let files = try #require(owner.withLock { $0 })
                publishing.withLock { $0 = Task { try await files.publish(attempt, notes: "after rename", template: .default, keeping: .rotation) } }
                try rename(from, to)
            }
            let binding = disk
            let storage = CallsStorage(folder: root, journal: nil, makeCalls: {
                Calls(folder: $0, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: binding)
            })
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            owner.withLock { $0 = files }
            _ = try await files.claim(attempt); #expect(try await files.start(attempt))
            try await storage.rename(id: first, title: "renamed")
            try await #require(publishing.withLock { $0 }).value
            #expect(try await files.notes(call: first)?.text == "after rename")
            #expect(try await storage.location(id: first).lastPathComponent == first + " renamed")
            #expect(!FileManager.default.fileExists(atPath: folder.path))
        }
    }
}

private func seedPair(_ call: String, folder: URL, files: Files) async throws {
    for text in ["Previous", "Current"] {
        let record = Record(job: UUID().uuidString, call: call, input: "input", snapshot: Data(), phase: "pending")
        _ = try await files.claim(record); #expect(try await files.start(record))
        try await files.publish(record, notes: text, template: .init(id: text, name: text), keeping: .rotation)
        var terminal = record; terminal.phase = "succeeded"
        try await files.progress(terminal)
    }
}
