import Composer
import Foundation
import RecordingConditions
import Testing

struct DiskReadingsAdapterTests {

    @Test func existingFolderReadsWritableAndCapacity() throws {
        let root = try makeTemporaryFolder()
        defer { try? FileManager.default.removeItem(at: root) }
        let reads = Values<URL>()
        let sut = DiskReadingsAdapter(folder: { root }, capacity: FixtureCapacity(read: { reads.append($0); return 7 }))

        #expect(sut.read() == DiskReadings(folderExists: true, writable: true, availableCapacity: 7))
        #expect(reads.all == [root])
    }

    @Test func missingFolderReadsNoCapacity() throws {
        let root = try makeTemporaryFolder()
        defer { try? FileManager.default.removeItem(at: root) }
        let reads = Values<URL>()
        let sut = DiskReadingsAdapter(folder: { root.appendingPathComponent("missing") }, capacity: FixtureCapacity(read: { reads.append($0); return 7 }))

        #expect(sut.read() == DiskReadings(folderExists: false, writable: false, availableCapacity: nil))
        #expect(reads.all.isEmpty)
    }

    @Test func fileInPlaceOfTheFolderIsMissing() throws {
        let root = try makeTemporaryFolder()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("calls")
        try Data().write(to: file)
        let sut = DiskReadingsAdapter(folder: { file }, capacity: FixtureCapacity(read: { _ in 7 }))

        #expect(sut.read().folderExists == false)
    }

    @Test func readOnlyFolderIsNotWritable() throws {
        let root = try makeTemporaryFolder()
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: root.path)
            try? FileManager.default.removeItem(at: root)
        }
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: root.path)
        let sut = DiskReadingsAdapter(folder: { root }, capacity: FixtureCapacity(read: { _ in 7 }))

        #expect(sut.read() == DiskReadings(folderExists: true, writable: false, availableCapacity: 7))
    }

    private func makeTemporaryFolder() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
