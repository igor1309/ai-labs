import AVFoundation
import Darwin
import Foundation

/// Recorded folders, identified by the timestamp prefix that survives a title change.
public struct Calls: Sendable {

    public struct Call: Equatable, Sendable {
        public let id: String
        public let title: String
        public let start: Date
        public let duration: TimeInterval?

        public init(id: String, title: String, start: Date, duration: TimeInterval?) {
            self.id = id; self.title = title; self.start = start; self.duration = duration
        }
    }

    public struct Count: Equatable, Sendable {
        public let calls: Int
        public let bytes: Int64
    }

    private let folder: URL
    private let timeZone: TimeZone
    private let children: @Sendable (URL) throws -> [URL]
    private let values: @Sendable (URL) throws -> URLResourceValues
    private let duration: @Sendable (URL) throws -> TimeInterval
    private let rename: @Sendable (URL, URL) throws -> Void
    private let remove: @Sendable (URL) throws -> Void

    public init(folder: URL, timeZone: TimeZone) {
        self.init(folder: folder, timeZone: timeZone,
                  children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                  values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                  duration: {
                      let file = try AVAudioFile(forReading: $0)
                      return Double(file.length) / file.fileFormat.sampleRate
                  }, rename: { source, target in
                      guard renamex_np(source.path, target.path, UInt32(RENAME_EXCL)) == 0 else {
                          throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                      }
                  }, remove: { try FileManager.default.removeItem(at: $0) })
    }

    init(folder: URL, timeZone: TimeZone,
         children: @escaping @Sendable (URL) throws -> [URL],
         values: @escaping @Sendable (URL) throws -> URLResourceValues,
         duration: @escaping @Sendable (URL) throws -> TimeInterval,
         rename: @escaping @Sendable (URL, URL) throws -> Void,
         remove: @escaping @Sendable (URL) throws -> Void) {
        self.folder = folder
        self.timeZone = timeZone
        self.children = children
        self.values = values
        self.duration = duration
        self.rename = rename
        self.remove = remove
    }

    public func list() throws -> [Call] {
        try folders().map { url, name in
            let lengths = ["microphone.caf", "call.caf"].compactMap { track -> TimeInterval? in
                let trackURL = url.appendingPathComponent(track)
                guard let info = try? values(trackURL), info.isSymbolicLink != true,
                      let length = try? duration(trackURL), length.isFinite, length >= 0 else { return nil }
                return length
            }
            return Call(id: name.id, title: name.title, start: name.start, duration: lengths.max())
        }.sorted { $0.id > $1.id }
    }

    /// Resolves afresh, including when the title has changed in Finder.
    public func location(id: String) throws -> URL {
        let matches = try folders().filter { $0.1.id == id }
        guard matches.count == 1, let match = matches.first else {
            throw Failure(description: matches.isEmpty ? "Звонок «\(id)» больше не найден." : "Несколько папок имеют префикс «\(id)».")
        }
        return match.0
    }

    public func rename(id: String, title: String) throws {
        guard !title.contains("\0") else { throw Failure(description: "Название содержит недопустимый символ.") }
        let source = try location(id: id)
        let title = title.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        let target = folder.appendingPathComponent(id + (title.isEmpty ? "" : " " + title), isDirectory: true)
        guard source != target else { return }
        try rename(source, target)
    }

    public func delete(id: String) throws {
        let source = try location(id: id)
        do { try remove(source) }
        catch { throw Failure(description: "Не удалось удалить «\(source.lastPathComponent)» целиком; часть папки могла остаться. \(error.localizedDescription)") }
    }

    public func count() throws -> Count {
        let calls = try folders()
        return Count(calls: calls.count, bytes: try calls.reduce(0) { try $0 + size($1.0) })
    }

    private func size(_ url: URL) throws -> Int64 {
        let info = try values(url)
        if info.isSymbolicLink == true { return 0 }
        if info.isDirectory == true { return try children(url).reduce(0) { try $0 + size($1) } }
        return Int64(info.fileSize ?? 0)
    }

    private func folders() throws -> [(URL, Name)] {
        guard folder.isFileURL else { throw POSIXError(.EINVAL) }
        return try children(folder).compactMap { url in
            guard let name = Self.parse(url.lastPathComponent, timeZone: timeZone) else { return nil }
            let info = try values(url)
            guard info.isDirectory == true, info.isSymbolicLink != true else { return nil }
            return (url, name)
        }
    }

    /// Extracts only names the call-folder writer can make, with a valid local timestamp.
    public static func id(in name: String, timeZone: TimeZone) -> String? {
        parse(name, timeZone: timeZone)?.id
    }

    private struct Name {
        let id: String
        let title: String
        let start: Date
    }

    private static func parse(_ name: String, timeZone: TimeZone) -> Name? {
        guard let range = name.range(of: #"^\d{4}\.\d{2}\.\d{2}-\d{4}(?:-[2-9][0-9]*|-1[0-9]+)?(?= |$)"#, options: .regularExpression) else { return nil }
        let id = String(name[range])
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy.MM.dd-HHmm"
        formatter.isLenient = false
        let timestamp = String(id.prefix(15))
        guard let date = formatter.date(from: timestamp), formatter.string(from: date) == timestamp else { return nil }
        let suffix = name[range.upperBound...]
        return Name(id: id, title: suffix.isEmpty ? "" : String(suffix.dropFirst()), start: date)
    }

    private struct Failure: LocalizedError {
        let description: String
        var errorDescription: String? { description }
    }
}
