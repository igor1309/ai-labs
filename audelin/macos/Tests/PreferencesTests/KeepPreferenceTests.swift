import BlockingTestWork
import Foundation
import Preferences
import Testing

@Suite struct KeepPreferenceTests {
    @Test func missingChoiceIsOnAndSavedChoiceSurvivesRelaunch() async throws {
        try await withKeepFile { file in
            let store = PreferencesStore(fileURL: file)
            #expect(store.read().keepPreviousNotes)
            try store.updateKeeping(false)
            #expect(!PreferencesStore(fileURL: file).read().keepPreviousNotes)
        }
    }

    @Test func successfulChangesAreObserved() async throws {
        try await withKeepFile { file in
            let store = PreferencesStore(fileURL: file)
            var values = store.keepingChanges().makeAsyncIterator()
            try store.updateKeeping(false)
            #expect(await values.next() == false)
            try store.updateKeeping(true)
            #expect(await values.next() == true)
        }
    }

    @Test func otherPreferenceUpdatesPreserveKeeping() async throws {
        try await withKeepFile { file in
            let store = PreferencesStore(fileURL: file)
            try store.updateKeeping(false)
            try store.updateNotes(.init(enabled: true))
            _ = try await store.updateRecording(automatic: false, liveText: false)
            try store.updateLanguage(.english)
            try store.updateAppearance(.dark)
            try store.updateCallsFolder(file.deletingLastPathComponent())
            let saved = PreferencesStore(fileURL: file).read()
            #expect(!saved.keepPreviousNotes && saved.notes.enabled && !saved.automaticRecording && !saved.liveText)
            #expect(saved.language == .english && saved.appearance == .dark)
        }
    }

    @Test func failedSaveReportsFailureAndRetainsTheChoice() async throws {
        try await withKeepFile { file in
            let store = PreferencesStore(fileURL: file, replace: { _, _ in throw CocoaError(.fileWriteNoPermission) })
            #expect(throws: CocoaError.self) { try store.updateKeeping(false) }
            #expect(store.read().keepPreviousNotes)
            #expect(PreferencesStore(fileURL: file).read().keepPreviousNotes)
        }
    }

    @Test func corruptSettingsAreNotOverwrittenByAKeepChange() async throws {
        try await withKeepFile { file in
            let bad = Data("not settings".utf8)
            try bad.write(to: file)
            let store = PreferencesStore(fileURL: file)
            #expect(throws: CocoaError.self) { try store.updateKeeping(false) }
            #expect(try Data(contentsOf: file) == bad)
        }
    }
}

private func withKeepFile(_ body: (URL) async throws -> Void) async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try await withCleanup {
        try await body(root.appendingPathComponent("settings.json"))
    } cleanup: { try FileManager.default.removeItem(at: root) }
}
