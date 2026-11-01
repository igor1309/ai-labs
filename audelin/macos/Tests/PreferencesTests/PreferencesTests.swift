import BlockingTestWork
import Foundation
import Preferences
import Testing

struct PreferencesTests {

    @Test func missingFileGivesDefaultsWithoutCreatingIt() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let stored = await offPool { PreferencesStore(fileURL: file).read() }
            #expect(stored.automaticRecording)
            #expect(stored.liveText)
            #expect(stored.callsFolder == FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Recordings/Audelin", isDirectory: true))
            #expect(await !exists(file))
        }
    }

    @Test func writtenValueReadsBackAndCanBeReplaced() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = await offPool { PreferencesStore(fileURL: file) }
            let first = Preferences(automaticRecording: false, liveText: false,
                                    callsFolder: root.appendingPathComponent("first"))
            try await offPool { try store.write(first) }
            #expect(await offPool { PreferencesStore(fileURL: file).read() } == first)
            let firstData = try await contents(file)
            // An open handle keeps the old file whole when the path is replaced, not rewritten in place.
            let handle = try await offPool { try FileHandle(forReadingFrom: file) }
            let next = Preferences(automaticRecording: true, liveText: true,
                                   callsFolder: root.appendingPathComponent("a-longer-next-folder"))
            try await offPool { try store.write(next) }
            #expect(try await offPool { try handle.readToEnd() } == firstData)
            await offPool { try? handle.close() }
            #expect(store.read() == next)
            #expect(try JSONDecoder().decode(Preferences.self, from: await contents(file)) == next)
        }
    }

    @Test func partialFileFillsMissingKeysWithDefaults() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let folder = root.appendingPathComponent("calls")
            let cases: [(Data, Preferences)] = [
                (Data("{}".utf8), Preferences()),
                (Data(#"{"automaticRecording":false}"#.utf8), Preferences(automaticRecording: false)),
                (Data(#"{"liveText":false}"#.utf8), Preferences(liveText: false)),
                (try JSONSerialization.data(withJSONObject: ["callsFolder": folder.absoluteString]),
                 Preferences(callsFolder: folder)),
            ]
            for (data, expected) in cases {
                try await offPool { try data.write(to: file) }
                #expect(await offPool { PreferencesStore(fileURL: file).read() } == expected)
                #expect(try await contents(file) == data)
            }
        }
    }

    @Test func malformedOrUnreadableFileGivesDefaultsUntilWritten() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = await offPool { PreferencesStore(fileURL: file) }
            for text in ["{", "[]", #"{"automaticRecording":"off"}"#,
                         #"{"liveText":1}"#, #"{"callsFolder":42}"#] {
                let data = Data(text.utf8)
                try await offPool { try data.write(to: file) }
                #expect(store.read() == Preferences())
                #expect(try await contents(file) == data)
            }
            let replacement = Preferences(automaticRecording: false, liveText: false, callsFolder: root)
            try await offPool { try store.write(replacement) }
            #expect(store.read() == replacement)

            let unreadable = root.appendingPathComponent("directory")
            try await offPool { try FileManager.default.createDirectory(at: unreadable, withIntermediateDirectories: false) }
            #expect(await offPool { PreferencesStore(fileURL: unreadable).read() } == Preferences())
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: unreadable.path) }.isEmpty)
        }
    }

    @Test func writingCreatesTheParentFolders() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("data/nested/preferences.json")
            let expected = Preferences(automaticRecording: false, liveText: true, callsFolder: root)
            try await offPool { try PreferencesStore(fileURL: file).write(expected) }
            #expect(try JSONDecoder().decode(Preferences.self, from: await contents(file)) == expected)
        }
    }
}

private func contents(_ file: URL) async throws -> Data { try await offPool { try Data(contentsOf: file) } }

private func exists(_ file: URL) async -> Bool { await offPool { FileManager.default.fileExists(atPath: file.path) } }

private func withPreferencesFolder(_ body: (URL) async throws -> Void) async throws {

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("preferences-test-\(UUID())")
    try await offPool { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false) }
    do { try await body(root) } catch {
        await removeFolder(root)
        throw error
    }
    await removeFolder(root)
}

private func removeFolder(_ root: URL) async {

    do { try await offPool { try FileManager.default.removeItem(at: root) } }
    catch { Issue.record(error) }
}
