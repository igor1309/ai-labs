import Foundation
import Synchronization

public final class PreferencesStore: PreferenceSettingsStorage, Sendable {

    private let fileURL: URL
    // Readers take the snapshot; only writers wait for the disk.
    private let snapshot: Mutex<Preferences>
    private let writing = Mutex<Void>(())
    private let loadFailure: Bool

    /// Reads the file once; later reads return what was last read or written.
    public init(fileURL: URL) {

        self.fileURL = fileURL
        let result = Self.load(fileURL)
        snapshot = Mutex(result.value)
        loadFailure = result.failed
    }

    public func read() -> Preferences { snapshot.withLock { $0 } }

    public func write(_ preferences: Preferences) throws {

        guard !loadFailure else { throw CocoaError(.fileReadCorruptFile) }
        try writing.withLock { _ in
            let data = try JSONEncoder().encode(preferences)
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
            snapshot.withLock { $0 = preferences }
        }
    }

    /// Reads freshly under the same lock as writes, preserving concurrent recording edits.
    public func updateNotes(_ notes: NotesPreferences) throws {
        try writing.withLock { _ in
            let loaded = Self.load(fileURL)
            guard !loaded.failed else { throw CocoaError(.fileReadCorruptFile) }
            var current = loaded.value
            current.notes = notes
            let data = try JSONEncoder().encode(current)
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: fileURL, options: .atomic)
            snapshot.withLock { $0 = current }
        }
    }

    public func loadNotes() throws -> NotesPreferences {
        try writing.withLock { _ in
            let loaded = Self.load(fileURL)
            guard !loaded.failed else { throw CocoaError(.fileReadCorruptFile) }
            return loaded.value.notes
        }
    }

    private static func load(_ fileURL: URL) -> (value: Preferences, failed: Bool) {
        do {
            let data = try Data(contentsOf: fileURL)
            return (try JSONDecoder().decode(Preferences.self, from: data), false)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return (Preferences(), false)
        } catch {
            return (Preferences(), true)
        }
    }
}
