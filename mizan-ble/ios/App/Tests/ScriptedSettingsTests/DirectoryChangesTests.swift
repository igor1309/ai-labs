import Foundation
import Testing
@testable import ScriptedSettings

@MainActor @Suite struct DirectoryChangesTests {
    @Test func seesCreationReplacementAndAppend() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appending(path: "scripted-radio.json")
        let (changes, change) = AsyncStream<Void>.makeStream()
        let observation = DirectoryChanges().watch(path: file.path) { change.yield() }
        defer { observation.cancel() }
        var next = changes.makeAsyncIterator()

        try Data("{}".utf8).write(to: file)
        #expect(try await nextChange(&next))

        try Data("{ }".utf8).write(to: file, options: .atomic)
        #expect(try await nextChange(&next))

        let handle = try FileHandle(forWritingTo: file)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data("\n".utf8))
        try handle.close()
        #expect(try await nextChange(&next))
    }

    /// Bounds a wait for a change that must come; it never proves an absence.
    private func nextChange(_ iterator: inout AsyncStream<Void>.Iterator) async throws -> Bool {
        let deadline = Task { @MainActor in
            try await Task.sleep(for: .seconds(5))
            Issue.record("no change within 5 seconds")
        }
        defer { deadline.cancel() }
        return await iterator.next(isolation: #isolation) != nil
    }
}
