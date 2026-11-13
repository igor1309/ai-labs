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

    /// What a call says, for search: its published notes and its transcript lines.
    public struct Text: Equatable, Sendable {
        public struct Line: Equatable, Sendable {
            /// Seconds from the call's start.
            public let start: TimeInterval
            public let words: String
            /// The speaker label written in the saved transcript.
            public let label: String
            public init(start: TimeInterval, words: String, label: String = "") {
                self.start = start; self.words = words; self.label = label
            }
        }
        public let notes: String?
        public let transcript: [Line]
        public init(notes: String?, transcript: [Line]) { self.notes = notes; self.transcript = transcript }
    }

    public struct Count: Equatable, Sendable {
        public let calls: Int
        public let bytes: Int64
    }

    private let folder: URL
    private let timeZone: TimeZone
    private let duration: @Sendable (URL) throws -> TimeInterval
    private let disk: CallsDisk
    private let transcript: @Sendable (String) -> [Text.Line]

    /// Reads track durations with `duration`, a saved transcript's lines with
    /// `transcript`, and touches folders through `disk`. Listing performs
    /// blocking disk work.
    public init(folder: URL, timeZone: TimeZone,
                duration: @escaping @Sendable (URL) throws -> TimeInterval,
                transcript: @escaping @Sendable (String) -> [Text.Line],
                disk: CallsDisk) {
        self.folder = folder
        self.timeZone = timeZone
        self.duration = duration
        self.transcript = transcript
        self.disk = disk
    }

    private func children(_ url: URL) throws -> [URL] { try disk.children(url) }
    private func values(_ url: URL) throws -> URLResourceValues { try disk.values(url) }
    private func rename(_ source: URL, _ target: URL) throws { try disk.rename(source, target) }
    private func copy(_ source: URL, _ target: URL) throws { try disk.copy(source, target) }
    private func remove(_ url: URL) throws { try disk.remove(url) }
    private func trash(_ url: URL) throws { try disk.trash(url) }

    public func list() throws -> [Call] {
        try folders(in: folder).map { url, name in
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
    public func location(id: String) throws -> URL { try location(id: id, in: folder) }

    private func location(id: String, in root: URL) throws -> URL {
        let matches = try folders(in: root).filter { $0.1.id == id }
        guard matches.count == 1, let match = matches.first else {
            throw matches.isEmpty ? CallsFailure.notFound(id: id) : CallsFailure.ambiguous(id: id)
        }
        return match.0
    }

    public func rename(id: String, title: String) throws {
        guard !title.contains("\0") else { throw CallsFailure.invalidTitle }
        let source = try location(id: id)
        let target = folder.appendingPathComponent(CallFolderName.name(id: id, title: title), isDirectory: true)
        guard source != target else { return }
        try rename(source, target)
    }

    public func delete(id: String) throws {
        let source = try location(id: id)
        do { try trash(source) }
        catch { throw CallsFailure.trashFailed(folder: source.lastPathComponent, reason: error.localizedDescription) }
    }

    /// Reads the call's `summary.md` and `transcript.md`; a missing file reads as none.
    public func text(id: String) throws -> Text {
        let folder = try location(id: id)
        func string(_ name: String) throws -> String? {
            try disk.read(folder.appendingPathComponent(name)).map { String(decoding: $0, as: UTF8.self) }
        }
        let notes = try string("summary.md")
        return Text(notes: notes.flatMap { $0.isEmpty ? nil : $0 }, transcript: transcript(try string("transcript.md") ?? ""))
    }

    public func bytes(id: String) throws -> Int64 { try size(location(id: id)) }

    /// The callback durably records ownership before a destructive disk step.
    @discardableResult
    public func move(id: String, to destination: URL,
                     record: (Move) throws -> Void = { _ in }) throws -> Int64 {
        let source = try location(id: id)
        let destination = destination.resolvingSymlinksInPath().standardizedFileURL
        let sourcePath = source.resolvingSymlinksInPath().standardizedFileURL.path
        guard destination.isFileURL, destination.path != sourcePath,
              !destination.path.hasPrefix(sourcePath + "/") else { throw POSIXError(.EINVAL) }
        let target = destination.appendingPathComponent(source.lastPathComponent, isDirectory: true)
        guard try !children(destination).contains(where: {
            $0.lastPathComponent == target.lastPathComponent || CallFolderName($0.lastPathComponent, timeZone: timeZone)?.id == id
        }) else { throw CocoaError(.fileWriteFileExists) }
        var move = Move(source: source, target: target,
                        temporary: destination.appendingPathComponent(".audelin-move-" + UUID().uuidString, isDirectory: true))
        try record(move)
        do {
            let original = try manifest(source)
            try copy(source, move.temporary)
            guard try manifest(move.temporary) == original, try manifest(source) == original else {
                throw CallsFailure.sizeMismatch
            }
            move.phase = .publishing
            try record(move)
            try rename(move.temporary, target)
            move.phase = .removingSource
            try record(move)
            // Retirement keeps a partially deleted source out of call lookup.
            // The verified destination can rebuild it if deletion fails.
            try rename(source, move.retired)
            do { try removeIfPresent(move.retired) }
            catch {
                move.phase = .restoringSource
                try record(move)
                throw error
            }
            move.phase = .destination
            // Source deletion completed; the durable removingSource record can
            // finish recovery if only this final journal write fails.
            try? record(move)
            return original.values.reduce(0) { $0 + max(0, $1) }
        } catch {
            let failure = error
            // A failed journal write leaves the last durable phase sufficient for recovery.
            if move.phase == .removingSource { move.phase = .publishing }
            _ = try recover(move, record: record)
            throw failure
        }
    }

    public struct Move: Codable, Equatable, Sendable {
        public enum Phase: String, Codable, Sendable {
            case copying, publishing, removingSource, restoringSource, removingCopy, source, destination
        }
        public var source: URL
        public var target: URL
        public var temporary: URL
        public var phase: Phase
        public init(source: URL, target: URL, temporary: URL, phase: Phase = .copying) {
            self.source = source; self.target = target; self.temporary = temporary; self.phase = phase
        }
        public var owner: URL {
            switch phase {
            case .removingSource, .restoringSource, .destination: target
            default: source
            }
        }
        public var retired: URL {
            source.deletingLastPathComponent().appendingPathComponent(temporary.lastPathComponent + "-source", isDirectory: true)
        }
    }

    /// Recovery follows the recorded owner, including a title changed in Finder.
    @discardableResult
    public func recover(_ given: Move, record: (Move) throws -> Void) throws -> Move {
        var move = given
        if ![.source, .destination].contains(move.phase) {
            guard let name = CallFolderName(move.owner.lastPathComponent, timeZone: timeZone) else { throw POSIXError(.EINVAL) }
            let owner = try location(id: name.id, in: move.owner.deletingLastPathComponent())
            if move.phase == .removingSource || move.phase == .restoringSource {
                if owner.lastPathComponent != move.target.lastPathComponent, move.phase == .restoringSource {
                    // A rename of the owning copy must survive recovery; finish its move.
                    move.phase = .removingSource
                }
                // Keep the recorded root spelling consistent with the temporary
                // path, even when a directory listing returns a different alias.
                if owner.lastPathComponent != move.target.lastPathComponent {
                    move.target = move.target.deletingLastPathComponent().appendingPathComponent(owner.lastPathComponent, isDirectory: true)
                }
            } else if owner.lastPathComponent != move.source.lastPathComponent {
                move.source = move.source.deletingLastPathComponent().appendingPathComponent(owner.lastPathComponent, isDirectory: true)
            }
            if move != given { try record(move) }
        }
        switch move.phase {
        case .copying:
            try removeIfPresent(move.temporary)
            move.phase = .source
            try record(move)
        case .publishing:
            // Exclusive rename consumes the temporary name only when publication succeeds.
            move.phase = try exists(move.temporary) ? .copying : .removingCopy
            try record(move)
            return try recover(move, record: record)
        case .removingSource:
            if try exists(move.source) { try rename(move.source, move.retired) }
            do { try removeIfPresent(move.retired) }
            catch {
                let failure = error
                move.phase = .restoringSource
                try record(move)
                _ = try recover(move, record: record)
                throw failure
            }
            move.phase = .destination
            try record(move)
        case .restoringSource:
            try restoreCopy(from: move.target, to: move.source)
            guard try manifest(move.source) == manifest(move.target) else { throw CocoaError(.fileReadCorruptFile) }
            move.phase = .removingCopy
            try record(move)
            return try recover(move, record: record)
        case .removingCopy:
            try removeIfPresent(move.target)
            try removeIfPresent(move.retired)
            move.phase = .source
            try record(move)
        case .source, .destination: break
        }
        return move
    }

    private func exists(_ url: URL) throws -> Bool {
        // Directory entries are fresh; URL resource values may cache a removed entry.
        try children(url.deletingLastPathComponent()).contains { $0.lastPathComponent == url.lastPathComponent }
    }
    private func removeIfPresent(_ url: URL) throws {
        if try exists(url) { try remove(url) }
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

    private func restoreCopy(from copyURL: URL, to source: URL) throws {
        if try !exists(source) { try copy(copyURL, source); return }
        let saved = try values(copyURL), current = try values(source)
        if saved.isDirectory == true, saved.isSymbolicLink != true,
           current.isDirectory == true, current.isSymbolicLink != true {
            let savedChildren = try children(copyURL)
            let names = Set(savedChildren.map(\.lastPathComponent))
            for child in try children(source) where !names.contains(child.lastPathComponent) { try remove(child) }
            for child in savedChildren {
                try restoreCopy(from: child, to: source.appendingPathComponent(child.lastPathComponent))
            }
        } else {
            // Notes can change on the owning copy while restoration is pending.
            try remove(source)
            try copy(copyURL, source)
        }
    }

    public func count() throws -> Count {
        let calls = try folders(in: folder)
        return Count(calls: calls.count, bytes: try calls.reduce(0) { try $0 + size($1.0) })
    }

    private func size(_ url: URL) throws -> Int64 {
        let info = try values(url)
        if info.isSymbolicLink == true { return 0 }
        if info.isDirectory == true { return try children(url).reduce(0) { try $0 + size($1) } }
        return Int64(info.fileSize ?? 0)
    }

    private func folders(in root: URL) throws -> [(URL, CallFolderName)] {
        guard root.isFileURL else { throw POSIXError(.EINVAL) }
        return try children(root).compactMap { url in
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

}

/// What `Calls` refuses or could not finish, with the data a sentence needs; the UI writes the sentence.
public enum CallsFailure: Error, Equatable, Sendable {
    /// No call folder has this id any more.
    case notFound(id: String)
    /// More than one call folder has this id.
    case ambiguous(id: String)
    /// The title has a character a folder name cannot hold.
    case invalidTitle
    /// Removing the folder stopped part way; some of it may remain.
    case trashFailed(folder: String, reason: String)
    /// The copy's file sizes differ from the source's.
    case sizeMismatch
}

/// The file system as `Calls` lists, renames, copies, trashes and removes folders.
public struct CallsDisk: Sendable {

    var children: @Sendable (URL) throws -> [URL]
    var values: @Sendable (URL) throws -> URLResourceValues
    var copy: @Sendable (URL, URL) throws -> Void
    var rename: @Sendable (URL, URL) throws -> Void
    /// Moves a folder to the Trash of its volume, whole or not at all.
    public var trash: @Sendable (URL) throws -> Void
    var remove: @Sendable (URL) throws -> Void
    /// A file's bytes, or nil when it does not exist.
    var read: @Sendable (URL) throws -> Data? = { url in
        do { return try Data(contentsOf: url) }
        catch CocoaError.fileReadNoSuchFile { return nil }
    }

    /// The local file system; a rename never replaces an existing folder.
    public static let system = CallsDisk(
        children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
        values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
        copy: { try FileManager.default.copyItem(at: $0, to: $1) },
        rename: { source, target in
            guard renamex_np(source.path, target.path, UInt32(RENAME_EXCL)) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        },
        trash: { try FileManager.default.trashItem(at: $0, resultingItemURL: nil) },
        remove: { try FileManager.default.removeItem(at: $0) }
    )
}
