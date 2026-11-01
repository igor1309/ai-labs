import Foundation
import Synchronization

public final class PreferencesStore: PreferenceSettingsStorage, Sendable {

    private let fileURL: URL
    // Readers take the snapshot; only writers wait for the disk.
    private let snapshot: Mutex<Preferences>
    private let writing = Mutex<Void>(())

    /// Reads the file once; later reads return what was last read or written.
    public init(fileURL: URL) {

        self.fileURL = fileURL
        snapshot = Mutex(Self.load(fileURL))
    }

    public func read() -> Preferences { snapshot.withLock { $0 } }

    public func write(_ preferences: Preferences) throws {

        try writing.withLock { _ in
            let data = try JSONEncoder().encode(preferences)
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
            snapshot.withLock { $0 = preferences }
        }
    }

    private static func load(_ fileURL: URL) -> Preferences {

        guard let data = try? Data(contentsOf: fileURL),
              let preferences = try? JSONDecoder().decode(Preferences.self, from: data) else {
            return Preferences()
        }
        return preferences
    }
}
