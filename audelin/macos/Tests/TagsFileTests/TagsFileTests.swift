import Foundation
import TagsFile
import Testing

@Suite(.timeLimit(.minutes(1)))
struct TagsFileTests {

    @Test func aFolderWithoutTheFileHasNoTags() throws {
        try withFolder { folder in
            let tags = try TagsFile.read(in: folder)
            #expect(tags == [])
        }
    }

    @Test func aFileWrittenByHandIsReadTrimmedWithoutEmptyLines() throws {
        try withFolder { folder in
            try Data("  клиент \n\n   \nбанк\r\n".utf8).write(to: folder.appendingPathComponent("tags.txt"))
            #expect(try TagsFile.read(in: folder) == ["клиент", "банк"])
        }
    }

    @Test func writtenTagsAreOnePerLineAndReadBack() throws {
        try withFolder { folder in
            try TagsFile.write(["клиент", "банк"], in: folder)
            #expect(try String(contentsOf: folder.appendingPathComponent("tags.txt"), encoding: .utf8) == "клиент\nбанк\n")
            try TagsFile.write(["клиент"], in: folder)
            #expect(try TagsFile.read(in: folder) == ["клиент"])
        }
    }

    @Test func writingNoTagsLeavesNoFile() throws {
        try withFolder { folder in
            try TagsFile.write(["клиент"], in: folder)
            try TagsFile.write([], in: folder)
            #expect(!FileManager.default.fileExists(atPath: folder.appendingPathComponent("tags.txt").path))
            try TagsFile.write([], in: folder)
        }
    }

    @Test func aFileThatIsNotTextIsUnreadable() throws {
        try withFolder { folder in
            try Data([0xFF, 0xFE, 0xC0]).write(to: folder.appendingPathComponent("tags.txt"))
            #expect(throws: (any Error).self) { try TagsFile.read(in: folder) }
        }
    }

    @Test func aFolderInPlaceOfTheFileIsUnreadable() throws {
        try withFolder { folder in
            try FileManager.default.createDirectory(at: folder.appendingPathComponent("tags.txt"), withIntermediateDirectories: false)
            #expect(throws: (any Error).self) { try TagsFile.read(in: folder) }
        }
    }

    @Test func writingIntoAMissingFolderFails() throws {
        try withFolder { folder in
            #expect(throws: (any Error).self) { try TagsFile.write(["клиент"], in: folder.appendingPathComponent("gone")) }
        }
    }

    private func withFolder(_ body: (URL) throws -> Void) throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("tags-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        try body(folder)
    }
}
