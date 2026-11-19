import Calls
import CallsStorage
import Foundation
import Recordings
import TagsFile
import Testing
@testable import Composer

/// Recordings' calls port over real call folders: each call's tags are read with the
/// listing and written into its folder.
@Suite(.timeLimit(.minutes(1)))
struct SummaryCallsTagsTests {
    private let first = "1970.01.01-1000", second = "1970.01.01-1001", third = "1970.01.01-1002"

    @Test func listsEachCallWithItsTagsAsFirstWritten() async throws {
        try await withComposeFolder { root in
            for id in [first, second, third] { try call(id, in: root) }
            try Data("клиент\nКлиент\n\n банк \n".utf8).write(to: root.appendingPathComponent("\(first)/\(TagsFile.name)"))
            try Data([0xFF, 0xFE]).write(to: root.appendingPathComponent("\(second)/\(TagsFile.name)"))

            let listed = try await SummaryCalls(storage: storage(root), release: testTranscriptBuild.release, deleted: { _ in }).list()

            #expect(listed.map(\.tags) == [.known([]), .unreadable, .known(["клиент", "банк"])])
        }
    }

    @Test func setTagsWritesThemIntoTheCallsFolder() async throws {
        try await withComposeFolder { root in
            try call(first, in: root)
            let sut = SummaryCalls(storage: storage(root), release: testTranscriptBuild.release, deleted: { _ in })

            try await sut.setTags(id: first, tags: ["клиент", "найм"])

            #expect(try await sut.list().map(\.tags) == [.known(["клиент", "найм"])])
        }
    }

    @Test func aDeleteIsLoggedByTheCallsStartWithoutItsTitle() async throws {
        try await withComposeFolder { root in
            let titled = "1970.01.01-1000 Встреча с Анной"
            try call(titled, in: root)
            let log = FixtureLog()
            var sut = SummaryCalls(storage: storage(root), release: testTranscriptBuild.release, deleted: { _ in })
            sut.log = log

            let id = try #require(try await sut.list().first?.id)
            try await sut.delete(id: id)
            await #expect(throws: (any Error).self) { try await sut.delete(id: id) }

            #expect(log.entries.all.map(\.message) == ["deleted call=1970.01.01-1000 to Trash", "delete failed call=1970.01.01-1000"])
            #expect(!log.entries.all.contains { $0.message.contains("Анн") })
        }
    }

    private func call(_ id: String, in root: URL) throws {
        let folder = root.appendingPathComponent(id)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        try Data().write(to: folder.appendingPathComponent("call.caf"))
    }

    private func storage(_ root: URL) -> CallsStorage {
        var disk = CallsDisk.system
        disk.trash = removeForTrash
        return CallsStorage(folder: root, journal: nil, readPart: { _, _ in throw CocoaError(.fileReadUnknown) }, makeCalls: { [disk] in
            Calls(folder: $0, timeZone: .gmt, duration: { _ in 10 }, transcript: transcriptLines, disk: disk)
        })
    }
}
