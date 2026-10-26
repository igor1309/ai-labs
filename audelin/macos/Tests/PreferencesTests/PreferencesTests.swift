import Foundation
import Preferences
import Testing

struct PreferencesTests {

    @Test func missingFileGivesDefaultsWithoutCreatingIt() throws {

        try withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let stored = PreferencesStore(fileURL: file).read()
            #expect(stored.automaticRecording)
            #expect(stored.liveText)
            #expect(stored.callsFolder == FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Recordings/Audelin", isDirectory: true))
            #expect(!FileManager.default.fileExists(atPath: file.path))
        }
    }

    @Test func writtenValueReadsBackAndCanBeReplaced() throws {

        try withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = PreferencesStore(fileURL: file)
            let first = Preferences(automaticRecording: false, liveText: false,
                                    callsFolder: root.appendingPathComponent("first"))
            try store.write(first)
            #expect(PreferencesStore(fileURL: file).read() == first)
            let firstData = try Data(contentsOf: file)
            // An open handle keeps the old file whole when the path is replaced, not rewritten in place.
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }
            let next = Preferences(automaticRecording: true, liveText: true,
                                   callsFolder: root.appendingPathComponent("a-longer-next-folder"))
            try store.write(next)
            #expect(try handle.readToEnd() == firstData)
            #expect(store.read() == next)
            #expect(try JSONDecoder().decode(Preferences.self, from: Data(contentsOf: file)) == next)
        }
    }

    @Test func partialFileFillsMissingKeysWithDefaults() throws {

        try withPreferencesFolder { root in
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
                try data.write(to: file)
                #expect(PreferencesStore(fileURL: file).read() == expected)
                #expect(try Data(contentsOf: file) == data)
            }
        }
    }

    @Test func malformedOrUnreadableFileGivesDefaultsUntilWritten() throws {

        try withPreferencesFolder { root in
            let file = root.appendingPathComponent("preferences.json")
            let store = PreferencesStore(fileURL: file)
            for text in ["{", "[]", #"{"automaticRecording":"off"}"#,
                         #"{"liveText":1}"#, #"{"callsFolder":42}"#] {
                let data = Data(text.utf8)
                try data.write(to: file)
                #expect(store.read() == Preferences())
                #expect(try Data(contentsOf: file) == data)
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

    @Test func writingCreatesTheParentFolders() throws {

        try withPreferencesFolder { root in
            let file = root.appendingPathComponent("data/nested/preferences.json")
            let expected = Preferences(automaticRecording: false, liveText: true, callsFolder: root)
            try PreferencesStore(fileURL: file).write(expected)
            #expect(try JSONDecoder().decode(Preferences.self, from: Data(contentsOf: file)) == expected)
        }
    }
}

private func withPreferencesFolder(_ body: (URL) throws -> Void) throws {

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("preferences-test-\(UUID())")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer {
        do { try FileManager.default.removeItem(at: root) }
        catch { Issue.record(error) }
    }
    try body(root)
}
