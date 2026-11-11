import BlockingTestWork
import Foundation
import Preferences
import Testing

struct PreferencesTests {

    @Test func missingFileGivesDefaultsWithoutCreatingIt() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let stored = PreferencesStore(fileURL: file).read()
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
            let store = PreferencesStore(fileURL: file)
            let first = Preferences(automaticRecording: false, liveText: false,
                                    callsFolder: root.appendingPathComponent("first"))
            try store.write(first)
            #expect(PreferencesStore(fileURL: file).read() == first)
            let firstData = try await contents(file)
            // An open handle keeps the old file whole when the path is replaced, not rewritten in place.
            let handle = try FileHandle(forReadingFrom: file)
            let next = Preferences(automaticRecording: true, liveText: true,
                                   callsFolder: root.appendingPathComponent("a-longer-next-folder"))
            try store.write(next)
            #expect(try handle.readToEnd() == firstData)
            try? handle.close()
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
                (Data(#"{"language":"english"}"#.utf8), Preferences(language: .english)),
                (Data(#"{"language":"klingon","liveText":false}"#.utf8), Preferences(liveText: false, language: .system)),
                (Data(#"{"language":7}"#.utf8), Preferences()),
                (Data(#"{"appearance":"dark"}"#.utf8), Preferences(appearance: .dark)),
                (Data(#"{"appearance":"sepia","liveText":false}"#.utf8), Preferences(liveText: false, appearance: .system)),
                (try JSONSerialization.data(withJSONObject: ["callsFolder": folder.absoluteString]),
                 Preferences(callsFolder: folder)),
            ]
            for (data, expected) in cases {
                try data.write(to: file)
                #expect(PreferencesStore(fileURL: file).read() == expected)
                #expect(try await contents(file) == data)
            }
        }
    }

    @Test func malformedOrUnreadableFileGivesDefaultsUntilWritten() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = PreferencesStore(fileURL: file)
            for text in ["{", "[]", #"{"automaticRecording":"off"}"#,
                         #"{"liveText":1}"#, #"{"callsFolder":42}"#] {
                let data = Data(text.utf8)
                try data.write(to: file)
                #expect(store.read() == Preferences())
                #expect(try await contents(file) == data)
            }
            let replacement = Preferences(automaticRecording: false, liveText: false, callsFolder: root)
            try store.write(replacement)
            #expect(store.read() == replacement)

            let unreadable = root.appendingPathComponent("directory")
            try FileManager.default.createDirectory(at: unreadable, withIntermediateDirectories: false)
            #expect(PreferencesStore(fileURL: unreadable).read() == Preferences())
            #expect(try FileManager.default.contentsOfDirectory(atPath: unreadable.path).isEmpty)
        }
    }

    @Test func writingCreatesTheParentFolders() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("data/nested/preferences.json")
            let expected = Preferences(automaticRecording: false, liveText: true, callsFolder: root)
            try PreferencesStore(fileURL: file).write(expected)
            #expect(try JSONDecoder().decode(Preferences.self, from: await contents(file)) == expected)
        }
    }
}

extension PreferencesTests {

    @Test func theLanguageIsSystemUntilChosenAndAChoiceKeepsTheRest() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = PreferencesStore(fileURL: file)
            #expect(store.read().language == .system)
            let kept = Preferences(automaticRecording: false, liveText: false, callsFolder: root.appendingPathComponent("calls"))
            try store.write(kept)
            try store.updateLanguage(.russian)
            var expected = kept
            expected.language = .russian
            #expect(store.read() == expected)
            #expect(PreferencesStore(fileURL: file).read() == expected)
        }
    }

    @Test func theAppearanceIsSystemUntilChosenAndAChoiceKeepsTheRest() async throws {

        try await withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = PreferencesStore(fileURL: file)
            #expect(store.read().appearance == .system)
            let kept = Preferences(automaticRecording: false, liveText: false, callsFolder: root.appendingPathComponent("calls"), language: .english)
            try store.write(kept)
            try store.updateAppearance(.light)
            var expected = kept
            expected.appearance = .light
            #expect(store.read() == expected)
            #expect(PreferencesStore(fileURL: file).read() == expected)
        }
    }
}

private func contents(_ file: URL) async throws -> Data { try Data(contentsOf: file) }

private func exists(_ file: URL) async -> Bool { FileManager.default.fileExists(atPath: file.path) }

private func withPreferencesFolder(_ body: (URL) async throws -> Void) async throws {

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("preferences-test-\(UUID())")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    do { try await body(root) } catch {
        await removeFolder(root)
        throw error
    }
    await removeFolder(root)
}

private func removeFolder(_ root: URL) async {

    do { try FileManager.default.removeItem(at: root) }
    catch { Issue.record(error) }
}
