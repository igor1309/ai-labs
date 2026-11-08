import BlockingTestWork
import Foundation
import Preferences
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ConcurrentPreferencesTests {
    @Test func recordingEditAndNotesOptOutRacingBothLand() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let file = root.appendingPathComponent("preferences.json")
        try await withCleanup {
            for _ in 0..<50 {
                let store = PreferencesStore(fileURL: file)
                var initial = Preferences()
                initial.notes.enabled = true
                initial.automaticRecording = true
                initial.liveText = true
                try store.write(initial)
                var notes = initial.notes
                notes.enabled = false
                let disabled = notes

                async let saving: Void = store.updateNotes(disabled)
                async let editing = store.updateRecording(automatic: false, liveText: false)
                try await saving
                _ = try await editing

                let reopened = PreferencesStore(fileURL: file).read()
                #expect(!reopened.notes.enabled)
                #expect(!reopened.automaticRecording && !reopened.liveText)
            }
        } cleanup: {
            try FileManager.default.removeItem(at: root)
        }
    }
}
