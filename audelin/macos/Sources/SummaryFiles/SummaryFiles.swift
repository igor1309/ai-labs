import CryptoKit
import Darwin
import Foundation

public struct Record: Codable, Equatable, Sendable {
    public var job: String
    /// Supplied by the containing folder, never by the stored JSON.
    public var call: String = ""
    public var input: String
    public var snapshot: Data
    public var phase: String
    public var checkpoint: Data?
    public var warning: Bool
    private enum CodingKeys: String, CodingKey { case job, input, snapshot, phase, checkpoint, warning }
    public init(job: String, call: String, input: String, snapshot: Data, phase: String, checkpoint: Data? = nil, warning: Bool = false) {
        self.job = job; self.call = call; self.input = input; self.snapshot = snapshot
        self.phase = phase; self.checkpoint = checkpoint; self.warning = warning
    }
}
/// The template identity and display name captured when notes were made.
public struct Attribution: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public init(id: String, name: String) { self.id = id; self.name = name }
    public static let `default` = Attribution(id: "Default", name: "Default")
}
public enum Keeping: Equatable, Sendable { case rotation, replacement }
public struct Versions: Equatable, Sendable {
    public let previous: Notes?
    public let current: Notes
    public init(previous: Notes?, current: Notes) { self.previous = previous; self.current = current }
}
/// A version's saved notes, made date, template and transcript identity.
public struct Notes: Codable, Equatable, Sendable {
    public let text: String
    public let made: Date
    public let template: Attribution
    public let transcriptIdentity: String?
    public init(text: String, made: Date, template: Attribution = .default, transcriptIdentity: String? = nil) {
        self.text = text; self.made = made; self.template = template; self.transcriptIdentity = transcriptIdentity
    }
}
public protocol Locations: Sendable {
    /// The operation and rename/delete/move share one storage transaction boundary.
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) async throws -> Value
}
public protocol Disk: Sendable {
    func read(_ url: URL) throws -> Data
    func exists(_ url: URL) throws -> Bool
    func create(_ data: Data, at url: URL) throws -> Bool
    func replace(_ data: Data, at url: URL) throws
    /// A file's bytes and its modification time, both from the one file opened.
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date)
    func restore(_ data: Data, at url: URL, modified: Date) throws
    func remove(_ url: URL) throws
}
public struct FileDisk: Disk {
    public init() {}
    public func read(_ url: URL) throws -> Data { try Data(contentsOf: url) }
    public func exists(_ url: URL) throws -> Bool {
        var info = stat()
        if lstat(url.path, &info) == 0 {
            guard info.st_mode & S_IFMT == S_IFREG else { throw CocoaError(.fileReadCorruptFile) }
            return true
        }
        if errno == ENOENT { return false }
        throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }
    public func create(_ data: Data, at url: URL) throws -> Bool {
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".summary-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        try data.write(to: temporary, options: .withoutOverwriting)
        // A complete record is linked exclusively: observers cannot see a partial JSON write.
        if link(temporary.path, url.path) == 0 { return true }
        if errno == EEXIST { return false }
        throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }
    public func replace(_ data: Data, at url: URL) throws { try data.write(to: url, options: .atomic) }
    public func restore(_ data: Data, at url: URL, modified: Date) throws {
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".summary-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        try data.write(to: temporary, options: .withoutOverwriting)
        // Foundation's date setter rounds to microseconds; rollback preserves the read date's precision.
        let stamp = modified.timeIntervalSince1970
        let seconds = floor(stamp)
        let time = timespec(tv_sec: Int(seconds), tv_nsec: Int(((stamp - seconds) * 1e9).rounded()))
        let times = [time, time]
        guard utimensat(AT_FDCWD, temporary.path, times, 0) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        guard rename(temporary.path, url.path) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
    }
    public func remove(_ url: URL) throws { try FileManager.default.removeItem(at: url) }
    public func readStamped(_ url: URL) throws -> (data: Data, modified: Date) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var info = stat()
        guard fstat(handle.fileDescriptor, &info) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let modified = Date(timeIntervalSince1970: TimeInterval(info.st_mtimespec.tv_sec) + TimeInterval(info.st_mtimespec.tv_nsec) / 1e9)
        return (try handle.readToEnd() ?? Data(), modified)
    }
}

/// Keeps the isolated storage implementation behind an async boundary.
/// The concrete actor destructor must stay in its defining module.
public struct Files: Sendable {
    private let storage: any FilesStorage
    @inline(never) public init(locations: any Locations, disk: any Disk, ownershipDirectory: URL) {
        storage = DiskFiles(locations: locations, disk: disk, ownershipDirectory: ownershipDirectory)
    }
    public func release(job: String, call: String, input: String) async { await storage.release(job: job, call: call, input: input) }
    public func claim(_ record: Record, replacingInactive: Bool = false) async throws -> (owned: Bool, record: Record) {
        try await storage.claim(record, replacingInactive: replacingInactive)
    }
    /// Replaces the matching inactive attempt atomically, leaving published notes untouched.
    public func replaceAttempt(_ record: Record, with next: Record) async throws -> Record {
        try await storage.replaceAttempt(record, with: next)
    }
    public func load(call: String) async throws -> Record? { try await storage.load(call: call) }
    /// Replaces only the named interrupted or failed attempt; its durable input and outputs survive.
    public func retry(_ record: Record, job: String) async throws -> Record { try await storage.retry(record, job: job) }
    public func start(_ record: Record) async throws -> Bool { try await storage.start(record) }
    public func progress(_ record: Record) async throws { try await storage.progress(record) }
    /// First notes from callers that do not yet offer a keep choice use Default.
    public func publish(_ record: Record, notes: String) async throws {
        try await publish(record, notes: notes, template: .default, keeping: .replacement)
    }
    public func publish(_ record: Record, notes: String, template: Attribution, keeping: Keeping, transcriptIdentity: String? = nil) async throws {
        try await storage.publish(record, notes: notes, template: template, keeping: keeping, transcriptIdentity: transcriptIdentity)
    }
    public func versions(call: String) async throws -> Versions? { try await storage.versions(call: call) }
    /// Removes a cancelled attempt, restoring notes replaced by this instance's publication.
    /// Earlier notes and the transcript stay; inactive attempts need a free lease.
    public func discard(_ record: Record) async throws { try await storage.discard(record) }
    /// The call's published notes as saved, with when they were made, or nil when it has none.
    public func notes(call: String) async throws -> Notes? { try await storage.versions(call: call)?.current }
}
private protocol FilesStorage: Sendable {
    func release(job: String, call: String, input: String) async
    func claim(_ record: Record, replacingInactive: Bool) async throws -> (owned: Bool, record: Record)
    func replaceAttempt(_ record: Record, with next: Record) async throws -> Record
    func load(call: String) async throws -> Record?
    func retry(_ record: Record, job: String) async throws -> Record
    func start(_ record: Record) async throws -> Bool
    func progress(_ record: Record) async throws
    func publish(_ record: Record, notes: String, template: Attribution, keeping: Keeping, transcriptIdentity: String?) async throws
    func versions(call: String) async throws -> Versions?
    func discard(_ record: Record) async throws
}

private actor DiskFiles: FilesStorage {
    private let locations: any Locations
    private let disk: any Disk
    private let ownershipDirectory: URL
    private struct Identity: Hashable { var call: String; var job: String; var input: String }
    private var leases: [Identity: Int32] = [:]
    private struct Publication: Sendable { var previous: Data?; var versions: Versions?; var data: Data }
    private var publications: [Identity: Publication] = [:]
    /// All instances sharing calls must use the same ownership directory, outside movable call storage.
    public init(locations: any Locations, disk: any Disk, ownershipDirectory: URL) {
        self.locations = locations; self.disk = disk; self.ownershipDirectory = ownershipDirectory
    }
    deinit { for fd in leases.values { flock(fd, LOCK_UN); close(fd) } }

    private static func acquire(_ record: Record, directory: URL) throws -> Int32? {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let key = SHA256.hash(data: Data(record.job.utf8)).map { String(format: "%02x", $0) }.joined()
        let fd = open(directory.appendingPathComponent(key).path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else {
            let error = errno
            close(fd)
            if error == EWOULDBLOCK { return nil }
            throw POSIXError(POSIXErrorCode(rawValue: error) ?? .EIO)
        }
        // Never unlink lease files: an observer could otherwise lock a different inode.
        return fd
    }
    /// Call only after the request's resources have ended; releasing is idempotent.
    public func release(job: String, call: String, input: String) {
        if let fd = leases.removeValue(forKey: .init(call: call, job: job, input: input)) {
            // A concurrently spawned child may retain a copy until exec closes it.
            // End ownership explicitly rather than waiting for every copy to close.
            flock(fd, LOCK_UN)
            close(fd)
        }
    }
    public func claim(_ record: Record, replacingInactive: Bool) async throws -> (owned: Bool, record: Record) {
        try await locations.withFolder(call: record.call) { [disk, ownershipDirectory] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            if try disk.exists(path) {
                let current = try Self.read(path, disk: disk, call: record.call)
                if current.phase == "succeeded" {
                    guard try Self.removeSucceeded(current, at: path, disk: disk, directory: ownershipDirectory) else { throw CocoaError(.fileWriteUnknown) }
                } else if replacingInactive, ["failed", "interrupted"].contains(current.phase) {
                    return (true, try Self.replaceAttempt(current, with: record, at: path, disk: disk, directory: ownershipDirectory))
                }
                if current.phase != "succeeded" { return (false, current) }
            }
            let owned = try disk.create(JSONEncoder().encode(record), at: path)
            return (owned, owned ? record : try Self.read(path, disk: disk, call: record.call))
        }
    }
    public func replaceAttempt(_ record: Record, with next: Record) async throws -> Record {
        try await locations.withFolder(call: record.call) { [disk, ownershipDirectory] folder in
            try Self.replaceAttempt(record, with: next, at: folder.appendingPathComponent(".summary-job.json"), disk: disk, directory: ownershipDirectory)
        }
    }
    private static func replaceAttempt(_ record: Record, with next: Record, at path: URL, disk: any Disk, directory: URL) throws -> Record {
        guard next.call == record.call, next.job != record.job, next.phase == "pending",
              ["succeeded", "failed", "interrupted"].contains(record.phase),
              let lease = try acquire(record, directory: directory) else { throw CocoaError(.fileWriteUnknown) }
        defer { flock(lease, LOCK_UN); close(lease) }
        guard try read(path, disk: disk, call: record.call) == record else { throw CocoaError(.fileWriteUnknown) }
        try disk.replace(JSONEncoder().encode(next), at: path)
        return next
    }

    public func load(call: String) async throws -> Record? {
        try await locations.withFolder(call: call) { [disk, ownershipDirectory] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            guard try disk.exists(path) else { return nil }
            var record = try Self.read(path, disk: disk, call: call)
            if record.phase == "succeeded" {
                _ = try Self.removeSucceeded(record, at: path, disk: disk, directory: ownershipDirectory)
                return nil
            }
            if record.phase == "running" {
                guard let lease = try Self.acquire(record, directory: ownershipDirectory) else { return record }
                defer { close(lease) }
                let identity = record
                guard try disk.exists(path) else { return nil }
                record = try Self.read(path, disk: disk, call: call)
                guard record.job == identity.job, record.input == identity.input else { return record }
                if record.phase == "succeeded" {
                    try disk.remove(path)
                    return nil
                }
                // Completion can commit and release ownership between the first read and acquisition.
                guard record.phase == "running" else { return record }
                let output = folder.appendingPathComponent("summary.md")
                if try disk.exists(output), let receipt = Self.receipt(try disk.read(output)),
                   receipt.job == record.job, receipt.input == record.input {
                    try disk.remove(path)
                    return nil
                } else { record.phase = "interrupted" }
                // A failed recovery save still leaves running, which is never replayable.
                try disk.replace(JSONEncoder().encode(record), at: path)
            }
            return record
        }
    }
    public func retry(_ record: Record, job: String) async throws -> Record {
        try await locations.withFolder(call: record.call) { [disk, ownershipDirectory] folder in
            // The old attempt's lease serializes retries even across independent instances.
            guard let lease = try Self.acquire(record, directory: ownershipDirectory) else { throw CocoaError(.fileWriteUnknown) }
            defer { flock(lease, LOCK_UN); close(lease) }
            let path = folder.appendingPathComponent(".summary-job.json")
            let current = try Self.read(path, disk: disk, call: record.call)
            guard current == record, ["interrupted", "failed"].contains(current.phase), !job.isEmpty, job != current.job else {
                throw CocoaError(.fileWriteUnknown)
            }
            var next = current
            next.job = job; next.phase = "pending"; next.warning = false
            try disk.replace(JSONEncoder().encode(next), at: path)
            return next
        }
    }
    public func start(_ record: Record) async throws -> Bool {
        let identity = Identity(call: record.call, job: record.job, input: record.input)
        guard leases[identity] == nil else { return false }
        let lease: Int32? = try await locations.withFolder(call: record.call) { [disk, ownershipDirectory] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            guard let fd = try Self.acquire(record, directory: ownershipDirectory) else { return nil }
            do {
                var current = try Self.read(path, disk: disk, call: record.call)
                guard current.job == record.job, current.input == record.input, current.phase == "pending" else {
                    close(fd); return nil
                }
                current.phase = "running"
                try disk.replace(JSONEncoder().encode(current), at: path)
                return fd
            } catch { close(fd); throw error }
        }
        guard let lease else { return false }
        leases[identity] = lease
        publications = publications.filter { $0.key.call != record.call || $0.key == identity }
        return true
    }
    public func progress(_ record: Record) async throws {
        let identity = Identity(call: record.call, job: record.job, input: record.input)
        guard leases[identity] != nil else { throw CocoaError(.fileWriteUnknown) }
        defer { if record.phase != "running" { release(job: record.job, call: record.call, input: record.input) } }
        let publication = publications[identity]
        try await locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            do {
                let current = try Self.read(path, disk: disk, call: record.call)
                guard current.job == record.job, current.input == record.input, current.phase == "running" else { throw CocoaError(.fileWriteUnknown) }
                var updated = record
                if updated.checkpoint == nil { updated.checkpoint = current.checkpoint }
                if updated.phase == "succeeded" { try disk.remove(path) }
                else { try disk.replace(JSONEncoder().encode(updated), at: path) }
            } catch {
                // A failed make-again save retains the pair the caller could already read.
                if record.phase != "running", let publication, publication.versions != nil {
                    try Self.rollback(publication, at: folder.appendingPathComponent("summary.md"), disk: disk)
                }
                throw error
            }
        }
    }
    public func publish(_ record: Record, notes: String, template: Attribution, keeping: Keeping, transcriptIdentity: String? = nil) async throws {
        let identity = Identity(call: record.call, job: record.job, input: record.input)
        guard leases[identity] != nil else { throw CocoaError(.fileWriteUnknown) }
        let saved = publications[identity]
        let publication = try await locations.withFolder(call: record.call) { [disk] folder in
            try Task.checkCancellation()
            let current = try Self.read(folder.appendingPathComponent(".summary-job.json"), disk: disk, call: record.call)
            guard current.job == record.job, current.input == record.input, current.phase == "running" else { throw CocoaError(.fileWriteUnknown) }
            let output = folder.appendingPathComponent("summary.md")
            let previous: Data?
            let old: Versions?
            if let saved {
                previous = saved.previous
                old = saved.versions
            } else if try disk.exists(output) {
                let stamped = try disk.readStamped(output)
                previous = stamped.data
                old = try Self.versions(stamped.data, made: stamped.modified)
            } else { previous = nil; old = nil }
            let receipt = Receipt(job: record.job, input: record.input, warning: record.warning,
                                  template: template, previous: keeping == .rotation ? old?.current : nil, transcriptIdentity: transcriptIdentity)
            let marker = try JSONEncoder().encode(receipt).base64EncodedString()
            // The receipt and both versions share one rename, including recovery's completion evidence.
            let data = Data(("<!-- audelin-summary:" + marker + " -->\n" + notes).utf8)
            try Task.checkCancellation()
            try disk.replace(data, at: output)
            return Publication(previous: previous, versions: old, data: data)
        }
        // Keep rollback evidence through terminal saving: the caller may still accept cancellation.
        publications[identity] = publication
    }
    public func discard(_ record: Record) async throws {
        let identity = Identity(call: record.call, job: record.job, input: record.input)
        let ownsRunning = leases[identity] != nil
        let inactiveLease: Int32?
        if ownsRunning { inactiveLease = nil }
        else {
            guard let lease = try Self.acquire(record, directory: ownershipDirectory) else { throw CocoaError(.fileWriteUnknown) }
            inactiveLease = lease
        }
        defer { if let inactiveLease { flock(inactiveLease, LOCK_UN); close(inactiveLease) } }
        let publication = publications[identity]
        try await locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            let output = folder.appendingPathComponent("summary.md")
            let hasRecord: Bool
            do {
                hasRecord = try disk.exists(path)
                if hasRecord {
                    let current = try Self.read(path, disk: disk, call: record.call)
                    guard current.job == record.job, current.input == record.input,
                          ownsRunning ? current.phase == "running" : (["pending", "failed", "interrupted"].contains(current.phase) || publication != nil) else {
                        throw CocoaError(.fileWriteUnknown)
                    }
                } else {
                    // Cancellation can arrive while success is removing the record. Its publication still owns rollback.
                    guard publication != nil else { throw CocoaError(.fileWriteUnknown) }
                }
            } catch {
                if let publication { try Self.rollback(publication, at: output, disk: disk) }
                throw error
            }
            if let publication { try Self.rollback(publication, at: output, disk: disk) }
            if hasRecord { try disk.remove(path) }
        }
        publications[identity] = nil
        release(job: record.job, call: record.call, input: record.input)
    }
    private static func rollback(_ publication: Publication, at output: URL, disk: any Disk) throws {
        let ownsOutput: Bool
        do { ownsOutput = try disk.exists(output) && disk.read(output) == publication.data }
        catch {
            // A failed preflight cannot establish ownership. Reopen the file and compare
            // its bytes before restoring, including when the existence check failed.
            do { ownsOutput = try disk.readStamped(output).data == publication.data }
            catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
        }
        if ownsOutput { try restore(publication, at: output, disk: disk) }
    }
    private static func restore(_ publication: Publication, at output: URL, disk: any Disk) throws {
        if let previous = publication.previous, let versions = publication.versions {
            try disk.restore(previous, at: output, modified: versions.current.made)
        } else { try disk.remove(output) }
    }
    public func versions(call: String) async throws -> Versions? {
        try await locations.withFolder(call: call) { [disk] folder in
            let output = folder.appendingPathComponent("summary.md")
            guard try disk.exists(output) else { return nil }
            let (data, made) = try disk.readStamped(output)
            return try Self.versions(data, made: made)
        }
    }
    private static func versions(_ data: Data, made: Date) throws -> Versions {
        guard let text = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadInapplicableStringEncoding)
        }
        guard text.hasPrefix("<!-- audelin-summary:"), let newline = text.firstIndex(of: "\n") else {
            return Versions(previous: nil, current: Notes(text: text, made: made))
        }
        let metadata = receipt(data)
        return Versions(previous: metadata?.previous,
                        current: Notes(text: String(text[text.index(after: newline)...]), made: made,
                                       template: metadata?.template ?? .default, transcriptIdentity: metadata?.transcriptIdentity))
    }
    private static func removeSucceeded(_ record: Record, at path: URL, disk: any Disk, directory: URL) throws -> Bool {
        guard let lease = try acquire(record, directory: directory) else { return false }
        defer { flock(lease, LOCK_UN); close(lease) }
        guard try disk.exists(path) else { return true }
        guard try read(path, disk: disk, call: record.call) == record else { throw CocoaError(.fileWriteUnknown) }
        try disk.remove(path)
        return true
    }
    private static func read(_ url: URL, disk: any Disk, call: String) throws -> Record {
        var record = try JSONDecoder().decode(Record.self, from: disk.read(url))
        record.call = call
        guard !record.job.isEmpty, !record.input.isEmpty,
              ["pending", "running", "succeeded", "failed", "interrupted"].contains(record.phase) else { throw CocoaError(.fileReadCorruptFile) }
        return record
    }
    private struct Receipt: Codable {
        var job: String
        var input: String
        var warning: Bool
        var template: Attribution?
        var previous: Notes?
        var transcriptIdentity: String?
    }
    private static func receipt(_ data: Data) -> Receipt? {
        let prefix = data
        guard let newline = prefix.firstIndex(of: 10),
              let line = String(data: prefix[..<newline], encoding: .utf8),
              line.hasPrefix("<!-- audelin-summary:"), line.hasSuffix(" -->"),
              let payload = Data(base64Encoded: String(line.dropFirst(21).dropLast(4))) else { return nil }
        return try? JSONDecoder().decode(Receipt.self, from: payload)
    }
}
