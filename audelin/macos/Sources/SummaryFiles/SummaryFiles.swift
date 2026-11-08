import CryptoKit
import Darwin
import Foundation

public struct Record: Codable, Equatable, Sendable {
    public var job: String
    public var call: String
    public var input: String
    public var snapshot: Data
    public var phase: String
    public var checkpoint: Data?
    public var warning: Bool
    public init(job: String, call: String, input: String, snapshot: Data, phase: String, checkpoint: Data? = nil, warning: Bool = false) {
        self.job = job; self.call = call; self.input = input; self.snapshot = snapshot
        self.phase = phase; self.checkpoint = checkpoint; self.warning = warning
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
}

/// Keeps the isolated storage implementation behind an async boundary.
/// The concrete actor destructor must stay in its defining module.
public struct Files: Sendable {
    private let storage: any FilesStorage
    @inline(never) public init(locations: any Locations, disk: any Disk, ownershipDirectory: URL) {
        storage = DiskFiles(locations: locations, disk: disk, ownershipDirectory: ownershipDirectory)
    }
    public func release(job: String, call: String, input: String) async { await storage.release(job: job, call: call, input: input) }
    public func claim(_ record: Record) async throws -> (owned: Bool, record: Record) { try await storage.claim(record) }
    public func load(call: String) async throws -> Record? { try await storage.load(call: call) }
    public func start(_ record: Record) async throws -> Bool { try await storage.start(record) }
    public func progress(_ record: Record) async throws { try await storage.progress(record) }
    public func publish(_ record: Record, notes: String) async throws { try await storage.publish(record, notes: notes) }
}
private protocol FilesStorage: Sendable {
    func release(job: String, call: String, input: String) async
    func claim(_ record: Record) async throws -> (owned: Bool, record: Record)
    func load(call: String) async throws -> Record?
    func start(_ record: Record) async throws -> Bool
    func progress(_ record: Record) async throws
    func publish(_ record: Record, notes: String) async throws
}

private actor DiskFiles: FilesStorage {
    private let locations: any Locations
    private let disk: any Disk
    private let ownershipDirectory: URL
    private struct Identity: Hashable { var call: String; var job: String; var input: String }
    private var leases: [Identity: Int32] = [:]
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
    public func claim(_ record: Record) async throws -> (owned: Bool, record: Record) {
        try await locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            if try disk.exists(path) { return (false, try Self.read(path, disk: disk, call: record.call)) }
            let owned = try disk.create(JSONEncoder().encode(record), at: path)
            return (owned, owned ? record : try Self.read(path, disk: disk, call: record.call))
        }
    }
    public func load(call: String) async throws -> Record? {
        try await locations.withFolder(call: call) { [disk, ownershipDirectory] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            guard try disk.exists(path) else { return nil }
            var record = try Self.read(path, disk: disk, call: call)
            if record.phase == "running" {
                guard let lease = try Self.acquire(record, directory: ownershipDirectory) else { return record }
                defer { close(lease) }
                let identity = record
                record = try Self.read(path, disk: disk, call: call)
                // Completion can commit and release ownership between the first read and acquisition.
                guard record.phase == "running", record.job == identity.job, record.input == identity.input else { return record }
                let output = folder.appendingPathComponent("summary.md")
                if try disk.exists(output), let receipt = Self.receipt(try disk.read(output)),
                   receipt.job == record.job, receipt.input == record.input {
                    record.phase = "succeeded"; record.warning = receipt.warning
                } else { record.phase = "interrupted" }
                // A failed recovery save still leaves running, which is never replayable.
                try disk.replace(JSONEncoder().encode(record), at: path)
            }
            return record
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
        return true
    }
    public func progress(_ record: Record) async throws {
        guard leases[.init(call: record.call, job: record.job, input: record.input)] != nil else { throw CocoaError(.fileWriteUnknown) }
        defer { if record.phase != "running" { release(job: record.job, call: record.call, input: record.input) } }
        try await locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            let current = try Self.read(path, disk: disk, call: record.call)
            guard current.job == record.job, current.input == record.input, current.phase == "running" else { throw CocoaError(.fileWriteUnknown) }
            var updated = record
            if updated.checkpoint == nil { updated.checkpoint = current.checkpoint }
            try disk.replace(JSONEncoder().encode(updated), at: path)
        }
    }
    public func publish(_ record: Record, notes: String) async throws {
        guard leases[.init(call: record.call, job: record.job, input: record.input)] != nil else { throw CocoaError(.fileWriteUnknown) }
        try await locations.withFolder(call: record.call) { [disk] folder in
            let current = try Self.read(folder.appendingPathComponent(".summary-job.json"), disk: disk, call: record.call)
            guard current.job == record.job, current.input == record.input, current.phase == "running" else { throw CocoaError(.fileWriteUnknown) }
            let receipt = Receipt(job: record.job, input: record.input, warning: record.warning)
            let marker = try JSONEncoder().encode(receipt).base64EncodedString()
            // Receipt and notes are one atomic file replacement; an old complete output survives failure.
            let data = Data(("<!-- audelin-summary:" + marker + " -->\n" + notes).utf8)
            try disk.replace(data, at: folder.appendingPathComponent("summary.md"))
        }
    }
    private static func read(_ url: URL, disk: any Disk, call: String) throws -> Record {
        let record = try JSONDecoder().decode(Record.self, from: disk.read(url))
        guard !record.job.isEmpty, record.call == call, !record.input.isEmpty,
              ["pending", "running", "succeeded", "failed", "interrupted"].contains(record.phase) else { throw CocoaError(.fileReadCorruptFile) }
        return record
    }
    private struct Receipt: Codable { var job: String; var input: String; var warning: Bool }
    private static func receipt(_ data: Data) -> Receipt? {
        let prefix = data.prefix(4096)
        guard let newline = prefix.firstIndex(of: 10),
              let line = String(data: prefix[..<newline], encoding: .utf8),
              line.hasPrefix("<!-- audelin-summary:"), line.hasSuffix(" -->"),
              let payload = Data(base64Encoded: String(line.dropFirst(21).dropLast(4))) else { return nil }
        return try? JSONDecoder().decode(Receipt.self, from: payload)
    }
}
