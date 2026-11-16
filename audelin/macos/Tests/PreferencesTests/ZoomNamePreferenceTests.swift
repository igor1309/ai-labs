import BlockingTestWork
import Foundation
import Preferences
import Testing

@Suite struct ZoomNamePreferenceTests {
    @Test func unknownUntilRememberedAndKeptAcrossRelaunch() async throws {
        try await withZoomNameFile { file in
            let store = PreferencesStore(fileURL: file)
            #expect(store.read().zoomName == nil)
            try store.updateZoomName("Igor")
            #expect(store.read().zoomName == "Igor")
            #expect(PreferencesStore(fileURL: file).read().zoomName == "Igor")
        }
    }

    @Test func aNewerNameReplacesTheOld() async throws {
        try await withZoomNameFile { file in
            let store = PreferencesStore(fileURL: file)
            try store.updateZoomName("Igor")
            try store.updateZoomName("Igor M")
            #expect(PreferencesStore(fileURL: file).read().zoomName == "Igor M")
        }
    }

    @Test func otherPreferencesKeepItAndItKeepsThem() async throws {
        try await withZoomNameFile { file in
            let store = PreferencesStore(fileURL: file)
            try store.updateKeeping(false)
            try store.updateZoomName("Igor")
            try store.updateNotes(.init(enabled: true))
            _ = try await store.updateRecording(automatic: false, liveText: false)
            try store.updateLanguage(.english)
            try store.updateAppearance(.dark)
            try store.updateCallsFolder(file.deletingLastPathComponent())
            let saved = PreferencesStore(fileURL: file).read()
            #expect(saved.zoomName == "Igor" && !saved.keepPreviousNotes)
        }
    }
}

private func withZoomNameFile(_ body: (URL) async throws -> Void) async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try await withCleanup {
        try await body(root.appendingPathComponent("settings.json"))
    } cleanup: { try FileManager.default.removeItem(at: root) }
}
