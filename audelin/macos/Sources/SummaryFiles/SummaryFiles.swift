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
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) throws -> Value
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

public actor Files {
    private nonisolated let queue = DispatchSerialQueue(label: "audelin.summary.files")
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }
    private let locations: any Locations
    private let disk: any Disk
    public init(locations: any Locations, disk: any Disk) { self.locations = locations; self.disk = disk }
    public func claim(_ record: Record) throws -> (owned: Bool, record: Record) {
        try locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            if try disk.exists(path) { return (false, try Self.read(path, disk: disk, call: record.call)) }
            let owned = try disk.create(JSONEncoder().encode(record), at: path)
            return (owned, owned ? record : try Self.read(path, disk: disk, call: record.call))
        }
    }
    public func load(call: String) throws -> Record? {
        try locations.withFolder(call: call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            guard try disk.exists(path) else { return nil }
            var record = try Self.read(path, disk: disk, call: call)
            if record.phase == "running" {
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
    public func start(_ record: Record) throws -> Bool {
        try locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            // Cross-instance/process arbitration is held through read and durable running write.
            let lockURL = folder.appendingPathComponent(".summary-lock")
            let fd = open(lockURL.path, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
            guard fd >= 0 else { throw CocoaError(.fileWriteUnknown) }
            defer { flock(fd, LOCK_UN); close(fd) }
            guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { return false }
            var current = try Self.read(path, disk: disk, call: record.call)
            guard current.job == record.job, current.input == record.input, current.phase == "pending" else { return false }
            current.phase = "running"
            try disk.replace(JSONEncoder().encode(current), at: path)
            return true
        }
    }
    public func progress(_ record: Record) throws {
        try locations.withFolder(call: record.call) { [disk] folder in
            let path = folder.appendingPathComponent(".summary-job.json")
            let current = try Self.read(path, disk: disk, call: record.call)
            guard current.job == record.job, current.input == record.input, current.phase == "running" else { throw CocoaError(.fileWriteUnknown) }
            var updated = record
            if updated.checkpoint == nil { updated.checkpoint = current.checkpoint }
            try disk.replace(JSONEncoder().encode(updated), at: path)
        }
    }
    public func publish(_ record: Record, notes: String) throws {
        try locations.withFolder(call: record.call) { [disk] folder in
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
        guard let line = String(data: data.prefix(4096), encoding: .utf8)?.split(separator: "\n").first,
              line.hasPrefix("<!-- audelin-summary:"), line.hasSuffix(" -->"),
              let payload = Data(base64Encoded: String(line.dropFirst(21).dropLast(4))) else { return nil }
        return try? JSONDecoder().decode(Receipt.self, from: payload)
    }
}
