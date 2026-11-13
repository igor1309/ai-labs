import BlockingTestWork
import Darwin
import Foundation
import SummaryFiles
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct SummaryIndependentOwnerTests {
    @Test func aHeldDurableStartExcludesAnIndependentStorageOwner() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let leases = root.appendingPathComponent("leases")
        let disk = LeaseProbingDisk(leases: leases)
        try await withCleanup {
            let owner = Files(locations: IndependentLocation(folder: root), disk: disk, ownershipDirectory: leases)
            let observer = Files(locations: IndependentLocation(folder: root), disk: FileDisk(), ownershipDirectory: leases)
            let job = Record(job: "job", call: "call", input: "input", snapshot: Data(), phase: "pending")
            #expect(try await owner.claim(job).owned)
            #expect(try await owner.start(job))
            // The first durable write already happened under the lease.
            #expect(disk.leaseHeldDuringFirstStart.withLock { $0 } == true)
            // The two Locations have no shared mutex.
            #expect(try await observer.start(job) == false)
            #expect(try await observer.load(call: "call")?.phase == "running")
            try await owner.publish(job, notes: "complete")
            var terminal = job; terminal.phase = "succeeded"
            try await owner.progress(terminal)
            #expect(try await observer.load(call: "call") == terminal)
        } cleanup: {
            try FileManager.default.removeItem(at: root)
        }
    }
}
private struct IndependentLocation: Locations {
    let folder: URL
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) async throws -> Value { try operation(folder) }
}
private final class LeaseProbingDisk: Disk, Sendable {
    private let disk = FileDisk()
    private let leases: URL
    let leaseHeldDuringFirstStart = Mutex<Bool?>(nil)
    init(leases: URL) { self.leases = leases }
    func read(_ url: URL) throws -> Data { try disk.read(url) }
    func exists(_ url: URL) throws -> Bool { try disk.exists(url) }
    func create(_ data: Data, at url: URL) throws -> Bool { try disk.create(data, at: url) }
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date) { try FileDisk().readStamped(url) }
    func remove(_ url: URL) throws { try disk.remove(url) }
    func replace(_ data: Data, at url: URL) throws {
        if url.lastPathComponent == ".summary-job.json", try JSONDecoder().decode(Record.self, from: data).phase == "running",
           leaseHeldDuringFirstStart.withLock({ $0 == nil }) {
            let held = try probeLease()
            leaseHeldDuringFirstStart.withLock { $0 = held }
        }
        try disk.replace(data, at: url)
    }
    /// A second open description of a locked file is refused, in this process too.
    private func probeLease() throws -> Bool {
        let files = try FileManager.default.contentsOfDirectory(at: leases, includingPropertiesForKeys: nil)
        guard let file = files.first else { return false }
        let fd = open(file.path, O_RDWR | O_CLOEXEC)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        return flock(fd, LOCK_EX | LOCK_NB) != 0 && errno == EWOULDBLOCK
    }
}
