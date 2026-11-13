import Foundation

public enum BrowserSocketSecretFailure: Error, Equatable {
    case unreadable
}

/// The secret the native host presents as its first message, so that only
/// Audelin's own helper can talk to the app's socket. It lives in a file
/// only the user can read; the app creates it and replaces one that others
/// could read or that is not a secret of the expected size.
public enum BrowserSocketSecret {
    public static let size = 32

    public static func path(home: URL) -> URL {
        home.appendingPathComponent("Library/Application Support/Audelin/browser.secret")
    }

    /// The app's side: the secret at `path`, created or replaced as needed.
    public static func prepare(at path: URL) throws -> Data {
        if let existing = try? read(at: path) { return existing }
        var generator = SystemRandomNumberGenerator()
        let secret = Data((0..<size).map { _ in UInt8.random(in: .min ... .max, using: &generator) })
        let manager = FileManager.default
        try manager.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        let staged = path.deletingLastPathComponent().appendingPathComponent(".browser.secret-\(UUID().uuidString)")
        guard manager.createFile(atPath: staged.path, contents: secret, attributes: [.posixPermissions: 0o600]) else {
            throw BrowserSocketSecretFailure.unreadable
        }
        guard rename(staged.path, path.path) == 0 else {
            try? manager.removeItem(at: staged)
            throw BrowserSocketSecretFailure.unreadable
        }
        return secret
    }

    /// The helper's side: the secret, if the file is the user's own, private
    /// and of the expected size.
    public static func read(at path: URL) throws -> Data {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: path.path),
              let permissions = attributes[.posixPermissions] as? Int, permissions & 0o077 == 0,
              (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              let secret = FileManager.default.contents(atPath: path.path), secret.count == size
        else { throw BrowserSocketSecretFailure.unreadable }
        return secret
    }

    /// Compares without stopping at the first difference.
    static func matches(_ presented: Data, _ secret: Data) -> Bool {
        guard presented.count == secret.count else { return false }
        return zip(presented, secret).reduce(0) { $0 | ($1.0 ^ $1.1) } == 0
    }
}
