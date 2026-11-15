import BlockingTestWork
import Foundation
import SummaryFiles
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct SummaryVersionsTests {
    @Test(arguments: [0.0, 0.000000238, 0.123456789, 0.999999762])
    func restoringAFilePreservesItsReadDatePrecision(fraction: Double) async throws {
        try await withVersionsFolder { folder, _ in
            let output = folder.appendingPathComponent("summary.md")
            let disk = FileDisk()
            let made = Date(timeIntervalSince1970: 1_794_000_000 + fraction)
            try disk.restore(Data("original".utf8), at: output, modified: made)
            let before = try disk.readStamped(output)
            #expect(before.modified == made)
            try disk.replace(Data("candidate".utf8), at: output)
            try disk.restore(before.data, at: output, modified: before.modified)
            let after = try disk.readStamped(output)
            #expect(after.data == Data("original".utf8) && after.modified == before.modified)
        }
    }

    @Test(arguments: [0, 1, 2])
    func rotationKeepsOnlyTheOldCurrent(count: Int) async throws {
        try await withVersionsFolder { folder, files in
            var old: Notes?
            for index in 0..<count {
                try await publishVersion("old-\(index)", files: files, folder: folder)
                old = try await files.notes(call: "call")
            }
            try await publishVersion("new", files: files, folder: folder)
            let pair = try #require(try await files.versions(call: "call"))
            #expect(pair.previous == old)
            #expect(pair.current.text == "new")
            #expect(pair.current.template == Attribution(id: "id-new", name: "new"))
            #expect(try await files.notes(call: "call") == pair.current)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "transcript")
        }
    }

    @Test(arguments: [0, 1, 2])
    func replacementKeepsOnlyNewCurrent(count: Int) async throws {
        try await withVersionsFolder { folder, files in
            for index in 0..<count { try await publishVersion("old-\(index)", files: files, folder: folder) }
            try await publishVersion("new", files: files, folder: folder, keeping: .replacement)
            let pair = try #require(try await files.versions(call: "call"))
            #expect(pair.previous == nil)
            #expect(pair.current.text == "new")
            #expect(pair.current.template == Attribution(id: "id-new", name: "new"))
        }
    }

    @Test func attributionAndDatesSurviveTemplateRemovalAndRotation() async throws {
        try await withVersionsFolder { folder, files in
            let template = folder.appendingPathComponent("Daily.md")
            try Data("template instructions".utf8).write(to: template)
            try await publishVersion("Daily", files: files, folder: folder)
            let made = Date(timeIntervalSince1970: 1_794_000_000)
            try FileManager.default.setAttributes([.modificationDate: made], ofItemAtPath: folder.appendingPathComponent("summary.md").path)
            try FileManager.default.removeItem(at: template)
            let expected = Notes(text: "Daily", made: made, template: .init(id: "id-Daily", name: "Daily"))
            #expect(try await files.notes(call: "call") == expected)
            try await publishVersion("next", files: files, folder: folder)
            let reopened = Files(locations: VersionLocation(folder: folder), disk: FileDisk(), ownershipDirectory: folder.appendingPathComponent("leases"))
            #expect(try await reopened.versions(call: "call")?.previous == expected)
        }
    }

    @Test(arguments: [false, true])
    func legacyNotesReadAsDefaultWithoutRewriting(withReceipt: Bool) async throws {
        try await withVersionsFolder { folder, files in
            let legacy = withReceipt ? "<!-- audelin-summary:eyJqb2IiOiJvbGQiLCJpbnB1dCI6ImlucHV0Iiwid2FybmluZyI6ZmFsc2V9 -->\nlegacy" : "legacy"
            let output = folder.appendingPathComponent("summary.md")
            let bytes = Data(legacy.utf8)
            try bytes.write(to: output)
            let made = Date(timeIntervalSince1970: 1_794_000_000)
            try FileManager.default.setAttributes([.modificationDate: made], ofItemAtPath: output.path)
            let current = Notes(text: "legacy", made: made, template: .default)
            #expect(try await files.versions(call: "call") == Versions(previous: nil, current: current))
            #expect(try Data(contentsOf: output) == bytes)
            #expect(try FileDisk().readStamped(output).modified == made)
            try await publishVersion("new", files: files, folder: folder)
            #expect(try await files.versions(call: "call")?.previous == current)
        }
    }

    @Test(arguments: [Keeping.rotation, .replacement])
    func failedPublicationAndDiscardKeepTheWholePair(keeping: Keeping) async throws {
        try await withVersionsFolder { folder, files in
            try await publishVersion("A", files: files, folder: folder)
            try await publishVersion("B", files: files, folder: folder)
            let old = try await files.versions(call: "call")
            let disk = VersionDisk()
            let owner = Files(locations: VersionLocation(folder: folder), disk: disk, ownershipDirectory: folder.appendingPathComponent("leases"))
            let attempt = versionRecord("failed")
            _ = try await owner.claim(attempt); #expect(try await owner.start(attempt))
            disk.fail.withLock { $0 = true }
            await #expect(throws: (any Error).self) {
                try await owner.publish(attempt, notes: "candidate", template: .default, keeping: keeping)
            }
            #expect(try await files.versions(call: "call") == old)
            try await owner.discard(attempt)
            #expect(try await files.versions(call: "call") == old)
            #expect(try await files.load(call: "call") == nil)
            disk.fail.withLock { $0 = false }
            _ = try await owner.claim(attempt); #expect(try await owner.start(attempt))
            try await owner.publish(attempt, notes: "candidate", template: .default, keeping: keeping)
            try await owner.discard(attempt)
            #expect(try await files.versions(call: "call") == old)
            #expect(try await files.load(call: "call") == nil)
        }
    }

    @Test(arguments: [false, true])
    func readersSeeAWholePairAcrossTheCommit(after: Bool) async throws {
        try await withVersionsFolder { folder, files in
            try await publishVersion("A", files: files, folder: folder)
            try await publishVersion("B", files: files, folder: folder)
            let old = try #require(try await files.versions(call: "call"))
            let location = VersionGate(folder: folder)
            let owner = Files(locations: location, disk: FileDisk(), ownershipDirectory: folder.appendingPathComponent("leases"))
            let attempt = versionRecord("C")
            _ = try await owner.claim(attempt); #expect(try await owner.start(attempt))
            await location.hold(after: after)
            let publishing = Task { try await owner.publish(attempt, notes: "C", template: .default, keeping: .rotation) }
            var entered = location.entered.stream.makeAsyncIterator()
            _ = await entered.next()
            let result: Result<Versions?, any Error>
            do { result = .success(try await files.versions(call: "call")) }
            catch { result = .failure(error) }
            await location.release()
            try await publishing.value
            let read = try #require(try result.get())
            await owner.release(job: attempt.job, call: attempt.call, input: attempt.input)
            if after {
                #expect(read.previous == old.current && read.current.text == "C")
            } else { #expect(read == old) }
            let new = try #require(try await files.versions(call: "call"))
            #expect(new.previous == old.current && new.current.text == "C")
        }
    }

    @Test(arguments: [Keeping.rotation, .replacement])
    func recoveryAgreesWithTheAtomicCommit(keeping: Keeping) async throws {
        try await withVersionsFolder { folder, files in
            // Previous text makes the receipt larger than a small fixed read buffer.
            try await publishVersion("older", files: files, folder: folder)
            try await publishVersion(String(repeating: "A", count: 8_192), files: files, folder: folder)
            let old = try #require(try await files.versions(call: "call"))
            let disk = PublicationSnapshotDisk(folder: folder)
            let owner = Files(locations: VersionLocation(folder: folder), disk: disk, ownershipDirectory: folder.appendingPathComponent("leases"))
            let attempt = versionRecord("interrupted")
            _ = try await owner.claim(attempt); #expect(try await owner.start(attempt))
            disk.startCapturing()
            let template = Attribution(id: "id-B", name: "B")
            try await owner.publish(attempt, notes: "B", template: template, keeping: keeping)
            let snapshots = disk.stopCapturing()
            await owner.release(job: attempt.job, call: attempt.call, input: attempt.input)
            let new = try #require(try await files.versions(call: "call"))
            #expect(new.previous == (keeping == .rotation ? old.current : nil))
            #expect(new.current.text == "B" && new.current.template == template)
            var recoveredOld = false, recoveredNew = false
            for snapshot in snapshots {
                try await withVersionsFolder { recoveryFolder, reopened in
                    try snapshot.restore(to: recoveryFolder)
                    let record = try #require(try await reopened.load(call: "call"))
                    let pair = try #require(try await reopened.versions(call: "call"))
                    #expect(pair == old || pair == new, "\(snapshot.boundary)")
                    var expected = attempt
                    expected.phase = pair == new ? "succeeded" : "interrupted"
                    #expect(record == expected, "\(snapshot.boundary)")
                    recoveredOld = recoveredOld || pair == old
                    recoveredNew = recoveredNew || pair == new
                }
            }
            #expect(recoveredOld && recoveredNew)
        }
    }
    @Test(arguments: [Keeping.rotation, .replacement])
    func aFailedTerminalSaveRestoresThePublishedPair(keeping: Keeping) async throws {
        try await withVersionsFolder { folder, files in
            try await publishVersion("A", files: files, folder: folder)
            try await publishVersion("B", files: files, folder: folder)
            let old = try await files.versions(call: "call")
            let disk = VersionDisk()
            let owner = Files(locations: VersionLocation(folder: folder), disk: disk, ownershipDirectory: folder.appendingPathComponent("leases"))
            let record = versionRecord("candidate")
            _ = try await owner.claim(record); #expect(try await owner.start(record))
            try await owner.publish(record, notes: "C", template: .default, keeping: keeping)
            disk.failTerminal.withLock { $0 = true }
            var terminal = record; terminal.phase = "succeeded"
            await #expect(throws: (any Error).self) { try await owner.progress(terminal) }
            #expect(try await files.versions(call: "call") == old)
            #expect(try await files.load(call: "call")?.phase == "interrupted")
        }
    }

    @Test(arguments: ["succeeded", "failed", "interrupted"])
    func replacingASettledAttemptKeepsThePairAndRejectsAStaleReplacement(phase: String) async throws {
        try await withVersionsFolder { folder, files in
            try await publishVersion("A", files: files, folder: folder)
            try await publishVersion("B", files: files, folder: folder)
            let pair = try await files.versions(call: "call")
            var old = versionRecord("old"); old.phase = phase
            _ = try await files.claim(old)
            var next = versionRecord("next"); next.snapshot = Data("captured configuration".utf8)
            #expect(try await files.replaceAttempt(old, with: next) == next)
            #expect(try await files.load(call: "call") == next)
            #expect(try await files.versions(call: "call") == pair)
            await #expect(throws: (any Error).self) { try await files.replaceAttempt(old, with: versionRecord("stale")) }
            #expect(try await files.load(call: "call") == next)
        }
    }

    @Test(arguments: ["pending", "running"])
    func replacingAnActiveAttemptIsRefused(phase: String) async throws {
        try await withVersionsFolder { _, files in
            var old = versionRecord("old"); old.phase = phase
            _ = try await files.claim(old)
            await #expect(throws: (any Error).self) { try await files.replaceAttempt(old, with: versionRecord("next")) }
            // Read the durable record without recovery changing an abandoned running phase.
            let found = try await files.claim(versionRecord("observer"))
            #expect(!found.owned && found.record == old)
        }
    }

}

private func versionRecord(_ job: String) -> Record {
    Record(job: job, call: "call", input: "input", snapshot: Data(), phase: "pending")
}
private func publishVersion(_ text: String, files: Files, folder: URL, keeping: Keeping = .rotation) async throws {
    let record = versionRecord(UUID().uuidString)
    _ = try await files.claim(record)
    #expect(try await files.start(record))
    try await files.publish(record, notes: text, template: .init(id: "id-" + text, name: text), keeping: keeping)
    var terminal = record; terminal.phase = "succeeded"
    try await files.progress(terminal)
    // Independent publication fixtures retire the completed attempt.
    try FileManager.default.removeItem(at: folder.appendingPathComponent(".summary-job.json"))
}
private func withVersionsFolder(_ body: (URL, Files) async throws -> Void) async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try await withCleanup {
        try Data("transcript".utf8).write(to: folder.appendingPathComponent("transcript.md"))
        try await body(folder, Files(locations: VersionLocation(folder: folder), disk: FileDisk(), ownershipDirectory: folder.appendingPathComponent("leases")))
    } cleanup: { try FileManager.default.removeItem(at: folder) }
}
private struct VersionLocation: Locations {
    let folder: URL
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) async throws -> Value { try operation(folder) }
}
private final class PublicationSnapshotDisk: Disk, Sendable {
    struct Snapshot: Sendable {
        let boundary: String
        let files: [String: (data: Data, modified: Date)]
        func restore(to folder: URL) throws {
            for (path, file) in files {
                let url = folder.appendingPathComponent(path)
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try FileDisk().restore(file.data, at: url, modified: file.modified)
            }
        }
    }
    private let folder: URL
    private let base = FileDisk()
    private let snapshots = Mutex<[Snapshot]?>(nil)
    init(folder: URL) { self.folder = folder }
    func startCapturing() { snapshots.withLock { $0 = [] } }
    func stopCapturing() -> [Snapshot] {
        snapshots.withLock { value in
            defer { value = nil }
            return value ?? []
        }
    }
    private func capture(_ boundary: String) throws {
        guard snapshots.withLock({ $0 != nil }) else { return }
        var files: [String: (data: Data, modified: Date)] = [:]
        for path in try FileManager.default.subpathsOfDirectory(atPath: folder.path) {
            let url = folder.appendingPathComponent(path)
            if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                files[path] = try base.readStamped(url)
            }
        }
        let snapshot = Snapshot(boundary: boundary, files: files)
        snapshots.withLock { $0?.append(snapshot) }
    }
    private func observe<Value>(_ operation: String, at url: URL, _ body: () throws -> Value) throws -> Value {
        try capture("before \(operation) \(url.lastPathComponent)")
        let value = try body()
        try capture("after \(operation) \(url.lastPathComponent)")
        return value
    }
    func read(_ url: URL) throws -> Data { try observe("read", at: url) { try base.read(url) } }
    func exists(_ url: URL) throws -> Bool { try observe("exists", at: url) { try base.exists(url) } }
    func create(_ data: Data, at url: URL) throws -> Bool { try observe("create", at: url) { try base.create(data, at: url) } }
    func replace(_ data: Data, at url: URL) throws { try observe("replace", at: url) { try base.replace(data, at: url) } }
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date) { try observe("readStamped", at: url) { try base.readStamped(url) } }
    func restore(_ data: Data, at url: URL, modified: Date) throws { try observe("restore", at: url) { try base.restore(data, at: url, modified: modified) } }
    func remove(_ url: URL) throws { try observe("remove", at: url) { try base.remove(url) } }
}
private final class VersionDisk: Disk, Sendable {
    let failTerminal = Mutex(false)
    let fail = Mutex(false)
    private let base = FileDisk()
    func read(_ url: URL) throws -> Data { try base.read(url) }
    func exists(_ url: URL) throws -> Bool { try base.exists(url) }
    func create(_ data: Data, at url: URL) throws -> Bool { try base.create(data, at: url) }
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date) { try base.readStamped(url) }
    func restore(_ data: Data, at url: URL, modified: Date) throws { try base.restore(data, at: url, modified: modified) }
    func remove(_ url: URL) throws { try base.remove(url) }
    func replace(_ data: Data, at url: URL) throws {
        if url.lastPathComponent == ".summary-job.json", failTerminal.withLock({ $0 }) { throw CocoaError(.fileWriteUnknown) }
        if url.lastPathComponent == "summary.md", fail.withLock({ $0 }) { throw CocoaError(.fileWriteUnknown) }
        try base.replace(data, at: url)
    }
}
private actor VersionGate: Locations {
    let folder: URL
    nonisolated let entered = AsyncStream<Void>.makeStream()
    private var after: Bool?
    private var waiter: CheckedContinuation<Void, Never>?
    init(folder: URL) { self.folder = folder }
    func hold(after: Bool) { self.after = after }
    func release() { after = nil; waiter?.resume(); waiter = nil }
    private func pause() async { await withCheckedContinuation { waiter = $0; entered.continuation.yield(()) } }
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) async throws -> Value {
        if after == false { await pause() }
        let value = try operation(folder)
        if after == true { await pause() }
        return value
    }
}
