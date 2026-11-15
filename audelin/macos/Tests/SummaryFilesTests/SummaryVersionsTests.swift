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

    @Test(arguments: [false, true])
    func recoveryAgreesWithTheAtomicCommit(committed: Bool) async throws {
        try await withVersionsFolder { folder, files in
            // Previous text makes the receipt larger than a small fixed read buffer.
            try await publishVersion(String(repeating: "A", count: 8_192), files: files, folder: folder)
            let old = try #require(try await files.versions(call: "call"))
            let attempt = versionRecord("interrupted")
            _ = try await files.claim(attempt); #expect(try await files.start(attempt))
            if committed { try await files.publish(attempt, notes: "B", template: .default, keeping: .rotation) }
            await files.release(job: attempt.job, call: attempt.call, input: attempt.input)
            let reopened = Files(locations: VersionLocation(folder: folder), disk: FileDisk(), ownershipDirectory: folder.appendingPathComponent("leases"))
            let record = try #require(try await reopened.load(call: "call"))
            let pair = try #require(try await reopened.versions(call: "call"))
            #expect(record.phase == (committed ? "succeeded" : "interrupted"))
            if committed { #expect(pair.previous == old.current && pair.current.text == "B") }
            else { #expect(pair == old) }
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
private final class VersionDisk: Disk, Sendable {
    let fail = Mutex(false)
    private let base = FileDisk()
    func read(_ url: URL) throws -> Data { try base.read(url) }
    func exists(_ url: URL) throws -> Bool { try base.exists(url) }
    func create(_ data: Data, at url: URL) throws -> Bool { try base.create(data, at: url) }
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date) { try base.readStamped(url) }
    func restore(_ data: Data, at url: URL, modified: Date) throws { try base.restore(data, at: url, modified: modified) }
    func remove(_ url: URL) throws { try base.remove(url) }
    func replace(_ data: Data, at url: URL) throws {
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
