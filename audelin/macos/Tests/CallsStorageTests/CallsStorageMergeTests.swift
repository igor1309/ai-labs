import Calls
import CallsStorage
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallsStorageMergeTests {
    private let first = "1970.01.01-0000", second = "1970.01.01-0001"

    private func calls(in root: URL) throws {
        for id in [first, second] {
            let call = root.appendingPathComponent(id)
            try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
            try Data("# Transcript \(id)\n".utf8).write(to: call.appendingPathComponent("transcript.md"))
            try Data().write(to: call.appendingPathComponent("call.caf"))
        }
    }

    @Test func readsEachPartsSavedTranscriptAsWritten() async throws {
        try await withStorageFolder { root in
            try calls(in: root)
            let storage = makeStorage(folder: root)
            #expect(try await storage.savedTranscript(id: second) == Data("# Transcript \(second)\n".utf8))
        }
    }

    @Test func mergesCallsOfTheCallsFolderIntoTheEarliest() async throws {
        try await withStorageFolder { root in
            try calls(in: root)
            let storage = makeStorage(folder: root)
            let merged = try await storage.merge(ids: [second, first]) {
                try Data("joined".utf8).write(to: $0.appendingPathComponent("transcript.md"))
            }
            #expect(merged == first)
            #expect(try await storage.list().map(\.id) == [first])
            let folder = try await storage.location(id: first)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "joined")
            #expect(FileManager.default.fileExists(atPath: folder.appendingPathComponent(second).appendingPathComponent("transcript.md").path))
        }
    }

    @Test func aCallInAnotherFolderIsNotMerged() async throws {
        try await withStorageFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            try calls(in: source)
            let storage = makeStorage(folder: source, journal: root.appendingPathComponent("folders.json"))
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: false)
            _ = try await storage.prepareMove(to: destination)
            _ = try await storage.move(id: second, to: destination)
            await #expect(throws: (any Error).self) { _ = try await storage.merge(ids: [first, second]) { _ in } }
            #expect(try await storage.list().map(\.id).sorted() == [first, second])
        }
    }

    @Test func restoringPutsBackAMergeInterruptedBeforeItWasInPlace() async throws {
        try await withStorageFolder { root in
            try calls(in: root)
            let prepared = root.appendingPathComponent(".audelin-merge-interrupted")
            try FileManager.default.createDirectory(at: prepared, withIntermediateDirectories: false)
            try FileManager.default.moveItem(at: root.appendingPathComponent(second), to: prepared.appendingPathComponent(second))
            let storage = makeStorage(folder: root)
            try await storage.restore()
            #expect(try await storage.list().map(\.id) == [second, first])
            #expect(!FileManager.default.fileExists(atPath: prepared.path))
        }
    }
}
