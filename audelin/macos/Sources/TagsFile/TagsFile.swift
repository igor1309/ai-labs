import Foundation

/// A call's `tags.txt`: one tag per line, in the call's folder. The only reader and
/// writer of that file; it works in the folder it is given and resolves none.
public enum TagsFile {
    public static let name = "tags.txt"

    /// The tags in the folder, trimmed, with empty lines dropped; none when there is no file.
    /// Throws when the file is there but cannot be read as text.
    public static func read(in folder: URL) throws -> [String] {
        let url = folder.appendingPathComponent(name)
        let data: Data
        do { data = try Data(contentsOf: url) } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return []
        }
        guard let text = String(data: data, encoding: .utf8) else { throw CocoaError(.fileReadInapplicableStringEncoding) }
        return text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    /// Replaces the folder's tags as a whole; no tags leaves no file.
    public static func write(_ tags: [String], in folder: URL) throws {
        let url = folder.appendingPathComponent(name)
        guard !tags.isEmpty else {
            do { try FileManager.default.removeItem(at: url) } catch let error as CocoaError where error.code == .fileNoSuchFile {}
            return
        }
        try Data((tags.joined(separator: "\n") + "\n").utf8).write(to: url, options: .atomic)
    }
}
