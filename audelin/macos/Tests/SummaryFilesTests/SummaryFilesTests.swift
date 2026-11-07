import BlockingTestWork
import Foundation
import SummaryFiles
import Synchronization
import Testing

@Suite struct SummaryFilesTests {
    @Test func exclusiveClaimAndRunningSaveArbitrateAcrossInstances() async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk())
            let other = Files(locations: locations, disk: FileDisk())
            async let first = files.claim(record())
            async let second = other.claim(record(job: "other"))
            let claims = try await [first, second]
            #expect(claims.filter(\.owned).count == 1)
            #expect(claims[0].record == claims[1].record)
            let owned = claims.first!.record
            async let start = files.start(owned)
            async let duplicate = other.start(owned)
            #expect(try await [start, duplicate].filter { $0 }.count == 1)
            #expect(try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) } == "original transcript")
        }
    }
    @Test func publicationReceiptRecoversExactJobAndInputAfterTerminalSaveFailure() async throws {
        try await withFolder { folder, locations in
            let disk = FailingDisk(), files = Files(locations: locations, disk: disk)
            let record = record()
            _ = try await files.claim(record); _ = try await files.start(record)
            try await files.publish(record, notes: "# Complete notes")
            disk.failure.withLock { $0 = ".summary-job.json" }
            var terminal = record; terminal.phase = "succeeded"
            await #expect(throws: (any Error).self) { try await files.progress(terminal) }
            disk.failure.withLock { $0 = nil }
            #expect(try await files.load(call: "call")?.phase == "succeeded")
            let output = try await offPool { try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8) }
            #expect(output.hasSuffix("# Complete notes"))
            #expect(try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) } == "original transcript")
        }
    }
    @Test(arguments: ["job", "input"])
    func mismatchedReceiptNeverCompletesNewRunningClaim(field: String) async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk())
            _ = try await files.claim(record()); _ = try await files.start(record())
            try await files.publish(record(), notes: "old notes")
            var changed = record(); changed.phase = "running"
            if field == "job" { changed.job = "different" } else { changed.input = "different" }
            let bytes = try JSONEncoder().encode(changed)
            try await offPool { try bytes.write(to: folder.appendingPathComponent(".summary-job.json")) }
            #expect(try await files.load(call: "call")?.phase == "interrupted")
            #expect(try await files.start(changed) == false)
        }
    }
    @Test func failedReplacementKeepsPreviousCompleteNotes() async throws {
        try await withFolder { folder, locations in
            let disk = FailingDisk(), files = Files(locations: locations, disk: disk)
            _ = try await files.claim(record()); _ = try await files.start(record())
            try await files.publish(record(), notes: "old complete")
            let previous = try await offPool { try Data(contentsOf: folder.appendingPathComponent("summary.md")) }
            disk.failure.withLock { $0 = "summary.md" }
            await #expect(throws: (any Error).self) { try await files.publish(record(), notes: "replacement") }
            #expect(try await offPool { try Data(contentsOf: folder.appendingPathComponent("summary.md")) } == previous)
        }
    }
    @Test func corruptRecordIsNotAbsentAndPendingSurvivesRestart() async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk())
            _ = try await files.claim(record())
            #expect(try await files.load(call: "call") == record())
            try await offPool { try Data("{broken".utf8).write(to: folder.appendingPathComponent(".summary-job.json")) }
            await #expect(throws: (any Error).self) { try await files.claim(record()) }
            await #expect(throws: (any Error).self) { try await files.load(call: "call") }
        }
    }
    @Test func renameFollowsIdentityAndDeleteDoesNotRecreateFolder() async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk())
            _ = try await files.claim(record()); _ = try await files.start(record())
            let renamed = folder.appendingPathExtension("renamed")
            try await offPool {
                try FileManager.default.moveItem(at: folder, to: renamed)
                locations.folder.withLock { $0 = renamed }
            }
            try await files.publish(record(), notes: "renamed notes")
            #expect(try await offPool { try String(contentsOf: renamed.appendingPathComponent("summary.md"), encoding: .utf8) }.hasSuffix("renamed notes"))
            try await offPool { try FileManager.default.removeItem(at: renamed) }
            await #expect(throws: (any Error).self) { try await files.publish(record(), notes: "deleted") }
            #expect(await offPool { !FileManager.default.fileExists(atPath: renamed.path) && !FileManager.default.fileExists(atPath: folder.path) })
        }
    }
    @Test(arguments: ["claim", "running", "checkpoint"])
    func durableWriteFailuresAreVisible(stage: String) async throws {
        try await withFolder { _, locations in
            let disk = FailingDisk(), files = Files(locations: locations, disk: disk)
            if stage == "claim" {
                disk.failure.withLock { $0 = ".summary-job.json" }
                await #expect(throws: (any Error).self) { try await files.claim(record()) }
            } else {
                _ = try await files.claim(record())
                if stage == "checkpoint" { _ = try await files.start(record()) }
                disk.failure.withLock { $0 = ".summary-job.json" }
                if stage == "running" { await #expect(throws: (any Error).self) { try await files.start(record()) } }
                else {
                    var progress = record(); progress.phase = "running"; progress.checkpoint = Data("evidence".utf8)
                    let checkpoint = progress
                    await #expect(throws: (any Error).self) { try await files.progress(checkpoint) }
                }
            }
        }
    }
}
private func record(job: String = "job") -> Record {
    .init(job: job, call: "call", input: "input", snapshot: Data("immutable config".utf8), phase: "pending")
}
private final class Location: Locations, Sendable {
    let folder: Mutex<URL>
    init(_ folder: URL) { self.folder = Mutex(folder) }
    func withFolder<Value: Sendable>(call: String, _ work: @Sendable (URL) throws -> Value) throws -> Value {
        try folder.withLock { url in
            guard FileManager.default.fileExists(atPath: url.path) else { throw CocoaError(.fileNoSuchFile) }
            return try work(url)
        }
    }
}
private final class FailingDisk: Disk, Sendable {
    let failure = Mutex<String?>(nil)
    private let disk = FileDisk()
    func check(_ url: URL) throws { if failure.withLock({ $0 == url.lastPathComponent }) { throw CocoaError(.fileWriteUnknown) } }
    func exists(_ url: URL) throws -> Bool { try disk.exists(url) }
    func read(_ url: URL) throws -> Data { try disk.read(url) }
    func create(_ data: Data, at url: URL) throws -> Bool { try check(url); return try disk.create(data, at: url) }
    func replace(_ data: Data, at url: URL) throws { try check(url); try disk.replace(data, at: url) }
}
private func withFolder(_ body: (URL, Location) async throws -> Void) async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let folder = root.appendingPathComponent("call")
    try await offPool {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data("original transcript".utf8).write(to: folder.appendingPathComponent("transcript.md"))
    }
    try await withCleanup { try await body(folder, Location(folder)) } cleanup: { try FileManager.default.removeItem(at: root) }
}
