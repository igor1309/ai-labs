import BlockingTestWork
import Foundation
import SummaryFiles
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct SummaryIndependentOwnerTests {
    @Test func aHeldDurableStartExcludesAnIndependentStorageOwner() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try await offPool { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) }
        let disk = await offPool { HeldStartDisk() }
        try await withCleanup {
            let leases = root.appendingPathComponent("leases")
            let owner = Files(locations: IndependentLocation(folder: root), disk: disk, ownershipDirectory: leases)
            let observer = Files(locations: IndependentLocation(folder: root), disk: FileDisk(), ownershipDirectory: leases)
            let job = Record(job: "job", call: "call", input: "input", snapshot: Data(), phase: "pending")
            #expect(try await owner.claim(job).owned)
            let starting = Task { try await owner.start(job) }
            await disk.entered()
            do {
                // The two Locations have no shared mutex. The first write is still held.
                #expect(try await observer.start(job) == false)
                await offPool { disk.release() }
                #expect(try await starting.value)
                #expect(try await observer.load(call: "call")?.phase == "running")
                try await owner.publish(job, notes: "complete")
                var terminal = job; terminal.phase = "succeeded"
                try await owner.progress(terminal)
                #expect(try await observer.load(call: "call") == terminal)
            } catch {
                await offPool { disk.release() }
                _ = try? await starting.value
                throw error
            }
        } cleanup: {
            disk.close()
            try FileManager.default.removeItem(at: root)
        }
    }
}
private struct IndependentLocation: Locations {
    let folder: URL
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) throws -> Value { try operation(folder) }
}
private final class HeldStartDisk: Disk, Sendable {
    private let disk = FileDisk()
    private let pipe = Pipe()
    private let held = Mutex(false)
    private let signal = AsyncStream<Void>.makeStream()
    func entered() async { for await _ in signal.stream { return } }
    func release() { try? pipe.fileHandleForWriting.write(contentsOf: Data([1])) }
    func close() { try? pipe.fileHandleForReading.close(); try? pipe.fileHandleForWriting.close(); signal.continuation.finish() }
    func read(_ url: URL) throws -> Data { try disk.read(url) }
    func exists(_ url: URL) throws -> Bool { try disk.exists(url) }
    func create(_ data: Data, at url: URL) throws -> Bool { try disk.create(data, at: url) }
    func replace(_ data: Data, at url: URL) throws {
        if url.lastPathComponent == ".summary-job.json", try JSONDecoder().decode(Record.self, from: data).phase == "running",
           held.withLock({ value in let first = !value; value = true; return first }) {
            signal.continuation.yield(())
            _ = try pipe.fileHandleForReading.read(upToCount: 1)
        }
        try disk.replace(data, at: url)
    }
}
