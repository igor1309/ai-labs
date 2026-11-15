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

            let listed = try await SummaryCalls(storage: storage(root), deleted: { _ in }).list()

            #expect(listed.map(\.tags) == [.known([]), .unreadable, .known(["клиент", "банк"])])
        }
    }

    @Test func setTagsWritesThemIntoTheCallsFolder() async throws {
        try await withComposeFolder { root in
            try call(first, in: root)
            let sut = SummaryCalls(storage: storage(root), deleted: { _ in })

            try await sut.setTags(id: first, tags: ["клиент", "найм"])

            #expect(try await sut.list().map(\.tags) == [.known(["клиент", "найм"])])
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
        return CallsStorage(folder: root, journal: nil, makeCalls: { [disk] in
            Calls(folder: $0, timeZone: .gmt, duration: { _ in 10 }, transcript: transcriptLines, disk: disk)
        })
    }
}
