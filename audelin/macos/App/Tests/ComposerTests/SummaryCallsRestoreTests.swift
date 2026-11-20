import Calls
import Foundation
import Testing
@testable import Composer

/// Recordings' restore port through storage's folder ownership and Calls' disk adapter.
@Suite(.timeLimit(.minutes(1)))
struct SummaryCallsRestoreTests {
    @Test func restoresTheCallAtItsOwnerAfterAFolderMove() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let id = "1970.01.01-1000", other = "1970.01.01-1001"
            let call = source.appendingPathComponent(id + " Title")
            try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: source.appendingPathComponent(other), withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            let current = Data("current transcript".utf8), previous = Data("previous transcript".utf8)
            try current.write(to: call.appendingPathComponent("transcript.md"))
            try previous.write(to: call.appendingPathComponent("transcript-previous.md"))
            let storage = callsStorage(folder: source, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"), trash: removeForTrash)
            _ = try await storage.move(id: id, to: destination)
            let sut = SummaryCalls(storage: storage, release: testTranscriptBuild.release, deleted: { _ in
                Issue.record("Restore must not report a delete")
            })

            try await sut.restorePreviousTranscript(id: id)

            #expect(try await storage.savedTranscript(id: id) == previous)
            #expect(try Data(contentsOf: destination.appendingPathComponent(id + " Title/transcript-previous.md")) == current)
            await #expect(throws: Calls.TranscriptFailure.noPrevious(id: other)) {
                try await sut.restorePreviousTranscript(id: other)
            }
        }
    }
}
