import CallFolderName
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
    private let copy: @Sendable (URL, URL) throws -> Void
    private let remove: @Sendable (URL) throws -> Void

    /// Uses the supplied reader for track durations. Listing performs blocking disk work.
    public init(folder: URL, timeZone: TimeZone, duration: @escaping @Sendable (URL) throws -> TimeInterval) {
        self.init(folder: folder, timeZone: timeZone,
                  children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                  values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                  duration: duration, copy: { try FileManager.default.copyItem(at: $0, to: $1) }, rename: { source, target in
                      guard renamex_np(source.path, target.path, UInt32(RENAME_EXCL)) == 0 else {
                          throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                      }
                  }, remove: { try FileManager.default.removeItem(at: $0) })
    }

    init(folder: URL, timeZone: TimeZone,
         children: @escaping @Sendable (URL) throws -> [URL],
         values: @escaping @Sendable (URL) throws -> URLResourceValues,
         duration: @escaping @Sendable (URL) throws -> TimeInterval,
         copy: @escaping @Sendable (URL, URL) throws -> Void,
         rename: @escaping @Sendable (URL, URL) throws -> Void,
         remove: @escaping @Sendable (URL) throws -> Void) {
        self.folder = folder
        self.timeZone = timeZone
        self.children = children
        self.values = values
        self.duration = duration
        self.rename = rename
        self.remove = remove
        self.copy = copy
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
        let target = folder.appendingPathComponent(CallFolderName.name(id: id, title: title), isDirectory: true)
        guard source != target else { return }
        try rename(source, target)
    }

    public func delete(id: String) throws {
        let source = try location(id: id)
        do { try remove(source) }
        catch { throw Failure(description: "Не удалось удалить «\(source.lastPathComponent)» целиком; часть папки могла остаться. \(error.localizedDescription)") }
    }

    public func bytes(id: String) throws -> Int64 { try size(location(id: id)) }

    /// Publishes only a verified copy. If source deletion is partial, the verified
    /// copy restores missing entries before the destination is removed.
    @discardableResult
    public func move(id: String, to destination: URL) throws -> Int64 {
        let source = try location(id: id)
        let destination = destination.resolvingSymlinksInPath().standardizedFileURL
        let sourcePath = source.resolvingSymlinksInPath().standardizedFileURL.path
        guard destination.isFileURL, destination.path != sourcePath,
              !destination.path.hasPrefix(sourcePath + "/") else { throw POSIXError(.EINVAL) }
        let target = destination.appendingPathComponent(source.lastPathComponent, isDirectory: true)
        guard try !children(destination).contains(where: { $0.lastPathComponent == target.lastPathComponent }) else {
            throw CocoaError(.fileWriteFileExists)
        }
        let temporary = destination.appendingPathComponent(".audelin-move-" + UUID().uuidString, isDirectory: true)
        var published = false
        var deleting = false
        do {
            let original = try manifest(source)
            try copy(source, temporary)
            guard try manifest(temporary) == original, try manifest(source) == original else { throw Failure(description: "Размеры файлов копии не совпадают с исходными.") }
            try rename(temporary, target)
            published = true
            deleting = true
            try remove(source)
            return original.values.reduce(0) { $0 + max(0, $1) }
        } catch {
            let failure = error
            let copied = published ? target : temporary
            if deleting {
                // Keep the verified destination if restoration itself cannot finish.
                do {
                    try restoreMissing(from: copied, to: source)
                    guard try manifest(source) == manifest(copied) else { throw CocoaError(.fileReadCorruptFile) }
                } catch {
                    throw Failure(description: "Не удалось восстановить исходную папку; полная копия в \(copied.path). \(error.localizedDescription)")
                }
            }
            if try children(destination).contains(where: { $0.lastPathComponent == copied.lastPathComponent }) { try remove(copied) }
            throw failure
        }
    }

    private func manifest(_ root: URL) throws -> [String: Int64] {
        var result: [String: Int64] = [:]
        func visit(_ url: URL, _ path: String) throws {
            let info = try values(url)
            if info.isSymbolicLink == true { result[path] = -2 }
            else if info.isDirectory == true {
                result[path] = -1
                for child in try children(url) { try visit(child, path + "/" + child.lastPathComponent) }
            } else {
                guard let size = info.fileSize else { throw CocoaError(.fileReadUnknown) }
                result[path] = Int64(size)
            }
        }
        try visit(root, "")
        return result
    }

    private func restoreMissing(from copyURL: URL, to source: URL) throws {
        if (try? values(source)) == nil { try copy(copyURL, source); return }
        let info = try values(copyURL)
        if info.isDirectory == true, info.isSymbolicLink != true {
            for child in try children(copyURL) {
                try restoreMissing(from: child, to: source.appendingPathComponent(child.lastPathComponent))
            }
        }
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

    private func folders() throws -> [(URL, CallFolderName)] {
        guard folder.isFileURL else { throw POSIXError(.EINVAL) }
        return try children(folder).compactMap { url in
            guard let name = CallFolderName(url.lastPathComponent, timeZone: timeZone) else { return nil }
            let info = try values(url)
            guard info.isDirectory == true, info.isSymbolicLink != true else { return nil }
            return (url, name)
        }
    }

    /// Extracts only names the call-folder writer can make, with a valid local timestamp.
    public static func id(in name: String, timeZone: TimeZone) -> String? {
        CallFolderName(name, timeZone: timeZone)?.id
    }

    private struct Failure: LocalizedError {
        let description: String
        var errorDescription: String? { description }
    }
}
