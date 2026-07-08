import Foundation

/// Per-document playback position record, keyed by document path.
/// Owned by the reader (protocol-owned-by-client); stores the document-text
/// sentence anchor only — global settings stay in `@AppStorage`.
@MainActor
protocol PlaybackPositionStore: AnyObject {
    func anchor(forDocumentPath path: String) -> Int?
    func setAnchor(_ anchor: Int, forDocumentPath path: String)
    func clearAnchor(forDocumentPath path: String)
}

@MainActor
final class DefaultsPlaybackPositionStore: PlaybackPositionStore {

    private let defaults = UserDefaults.standard

    func anchor(forDocumentPath path: String) -> Int? {

        defaults.object(forKey: Self.key(forDocumentPath: path)) as? Int
    }

    func setAnchor(_ anchor: Int, forDocumentPath path: String) {
        defaults.set(anchor, forKey: Self.key(forDocumentPath: path))
    }

    func clearAnchor(forDocumentPath path: String) {
        defaults.removeObject(forKey: Self.key(forDocumentPath: path))
    }

    private static func key(forDocumentPath path: String) -> String {

        "playbackPositionAnchor:\(path)"
    }
}
