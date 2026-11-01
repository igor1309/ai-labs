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
        let seen = Seen()
        let observation = DirectoryChanges().watch(path: file.path) { seen.count += 1; change.yield() }
        defer { observation.cancel() }
        var next = changes.makeAsyncIterator()

        try Data("{}".utf8).write(to: file)
        #expect(try await nextChange(&next, seen: seen))

        try Data("{ }".utf8).write(to: file, options: .atomic)
        #expect(try await nextChange(&next, seen: seen))

        let handle = try FileHandle(forWritingTo: file)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data("\n".utf8))
        try handle.close()
        #expect(try await nextChange(&next, seen: seen))
    }

    /// Bounds a wait for a change that must come; it never proves an absence.
    /// The deadline asks whether a change was seen, not whether the waiter
    /// has resumed: after a stall on the main actor the change and the
    /// deadline both wait there, and the waiter can resume after the deadline.
    private func nextChange(_ iterator: inout AsyncStream<Void>.Iterator, seen: Seen) async throws -> Bool {
        let before = seen.count
        let deadline = Task { @MainActor in
            try await Task.sleep(for: .seconds(5))
            if seen.count == before { Issue.record("no change within 5 seconds") }
        }
        defer { deadline.cancel() }
        return await iterator.next(isolation: #isolation) != nil
    }
}

@MainActor private final class Seen { var count = 0 }
