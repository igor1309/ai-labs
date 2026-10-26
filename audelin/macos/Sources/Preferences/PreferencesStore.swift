import Foundation
import Synchronization

public final class PreferencesStore: Sendable {

    private let fileURL: URL
    private let access = Mutex<Void>(())

    public init(fileURL: URL) {

        self.fileURL = fileURL
    }

    public func read() -> Preferences {

        access.withLock { _ in
            guard let data = try? Data(contentsOf: fileURL),
                  let preferences = try? JSONDecoder().decode(Preferences.self, from: data) else {
                return Preferences()
            }
            return preferences
        }
    }

    public func write(_ preferences: Preferences) throws {

        try access.withLock { _ in
            let data = try JSONEncoder().encode(preferences)
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
        }
    }
}
