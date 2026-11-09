import BlockingTestWork
import Darwin
import Foundation
import SummaryFiles
import Synchronization
import Testing

@Suite struct SummaryFilesTests {
    @Test func exclusiveClaimAndRunningSaveArbitrateAcrossInstances() async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk(), ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            let other = Files(locations: locations, disk: FileDisk(), ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            async let first = files.claim(record())
            async let second = other.claim(record(job: "other"))
            let claims = try await [first, second]
            #expect(claims.filter(\.owned).count == 1)
            #expect(claims[0].record == claims[1].record)
            let owned = claims.first!.record
            async let start = files.start(owned)
            async let duplicate = other.start(owned)
            #expect(try await [start, duplicate].filter { $0 }.count == 1)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "original transcript")
        }
    }
    @Test func liveOwnerSurvivesObservationThroughPublicationAndTerminalSave() async throws {
        try await withFolder { folder, locations in
            let directory = folder.deletingLastPathComponent().appendingPathComponent("leases")
            let owner = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            let observer = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            let job = record()
            _ = try await owner.claim(job)
            #expect(try await owner.start(job))
            // Generation is held between start and publication by the caller.
            #expect(try await observer.load(call: "call")?.phase == "running")
            #expect(try await observer.start(job) == false)
            await #expect(throws: (any Error).self) { try await observer.publish(job, notes: "not owned") }
            try await owner.publish(job, notes: "complete result")
            #expect(try await observer.load(call: "call")?.phase == "running")
            var terminal = job; terminal.phase = "succeeded"
            try await owner.progress(terminal)
            #expect(try await observer.load(call: "call") == terminal)
            #expect(try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8).hasSuffix("complete result"))
        }
    }
    /// Contract test: kernel locks exclude another process and process exit proves abandonment.
    @Test func processExitPermitsRecoveryWithoutReplayingRunningWork() async throws {
        try await withFolder { folder, locations in
            let directory = folder.deletingLastPathComponent().appendingPathComponent("leases")
            let owner = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            let observer = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            _ = try await owner.claim(record()); _ = try await owner.start(record())
            let lock = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first!
            let probe = Process()
            probe.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
            probe.arguments = ["-e", "use Fcntl qw(:flock); open(my $f, '+<', $ARGV[0]) or die; exit(flock($f, LOCK_EX|LOCK_NB) ? 0 : 23);", lock.path]
            #expect(try await exitStatus(of: probe) == 23)
            await owner.release(job: "job", call: "call", input: "input")
            let child = try await TestCommand(URL(fileURLWithPath: "/usr/bin/perl"), ["-e", "use Fcntl qw(:flock); $|=1; open(my $f, '+<', $ARGV[0]) or die; flock($f, LOCK_EX|LOCK_NB) or die; print qq(held\n); <STDIN>;", lock.path])
            do {
                var output = child.output.makeAsyncIterator()
                #expect(await output.next() == Data("held\n".utf8))
                #expect(try await observer.load(call: "call")?.phase == "running")
                await child.stop()
                #expect(try await observer.load(call: "call")?.phase == "interrupted")
                #expect(try await observer.start(record()) == false)
            } catch { await child.stop(); throw error }
        }
    }
    @Test(arguments: [false, true])
    func publicationReceiptRecoversExactJobAndInputAfterTerminalSaveFailure(unicodeBoundary: Bool) async throws {
        try await withFolder { folder, locations in
            let disk = FailingDisk(), files = Files(locations: locations, disk: disk, ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            let record = record()
            _ = try await files.claim(record); _ = try await files.start(record)
            try await files.publish(record, notes: "# Complete notes")
            if unicodeBoundary {
                let bytes = try Data(contentsOf: folder.appendingPathComponent("summary.md"))
                let receiptLength = try #require(bytes.firstIndex(of: 10)) + 1
                let notes = String(repeating: "x", count: 4095 - receiptLength) + "Я\n# Complete notes"
                try await files.publish(record, notes: notes)
            }
            disk.failure.withLock { $0 = ".summary-job.json" }
            var terminal = record; terminal.phase = "succeeded"
            await #expect(throws: (any Error).self) { try await files.progress(terminal) }
            disk.failure.withLock { $0 = nil }
            let observer = Files(locations: locations, disk: FileDisk(), ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            #expect(try await observer.load(call: "call")?.phase == "succeeded")
            let output = try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8)
            #expect(output.hasSuffix("# Complete notes"))
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "original transcript")
        }
    }
    @Test(arguments: ["job", "input"])
    func mismatchedReceiptNeverCompletesNewRunningClaim(field: String) async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk(), ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            _ = try await files.claim(record()); _ = try await files.start(record())
            try await files.publish(record(), notes: "old notes")
            var changed = record(); changed.phase = "running"
            if field == "job" { changed.job = "different" } else { changed.input = "different" }
            let bytes = try JSONEncoder().encode(changed)
            try bytes.write(to: folder.appendingPathComponent(".summary-job.json"))
            await files.release(job: "job", call: "call", input: "input")
            #expect(try await files.load(call: "call")?.phase == "interrupted")
            #expect(try await files.start(changed) == false)
        }
    }
    @Test func failedReplacementKeepsPreviousCompleteNotes() async throws {
        try await withFolder { folder, locations in
            let disk = FailingDisk(), files = Files(locations: locations, disk: disk, ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            _ = try await files.claim(record()); _ = try await files.start(record())
            try await files.publish(record(), notes: "old complete")
            let previous = try Data(contentsOf: folder.appendingPathComponent("summary.md"))
            disk.failure.withLock { $0 = "summary.md" }
            await #expect(throws: (any Error).self) { try await files.publish(record(), notes: "replacement") }
            #expect(try Data(contentsOf: folder.appendingPathComponent("summary.md")) == previous)
        }
    }
    @Test func corruptRecordIsNotAbsentAndPendingSurvivesRestart() async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk(), ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            _ = try await files.claim(record())
            #expect(try await files.load(call: "call") == record())
            do { try Data("{broken".utf8).write(to: folder.appendingPathComponent(".summary-job.json")) }
            await #expect(throws: (any Error).self) { try await files.claim(record()) }
            await #expect(throws: (any Error).self) { try await files.load(call: "call") }
        }
    }
    @Test func renameFollowsIdentityAndDeleteDoesNotRecreateFolder() async throws {
        try await withFolder { folder, locations in
            let files = Files(locations: locations, disk: FileDisk(), ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
            _ = try await files.claim(record()); _ = try await files.start(record())
            let renamed = folder.appendingPathExtension("renamed")
            do {
                try FileManager.default.moveItem(at: folder, to: renamed)
                locations.folder.withLock { $0 = renamed }
            }
            try await files.publish(record(), notes: "renamed notes")
            #expect(try String(contentsOf: renamed.appendingPathComponent("summary.md"), encoding: .utf8).hasSuffix("renamed notes"))
            try FileManager.default.removeItem(at: renamed)
            await #expect(throws: (any Error).self) { try await files.publish(record(), notes: "deleted") }
            #expect(!FileManager.default.fileExists(atPath: renamed.path) && !FileManager.default.fileExists(atPath: folder.path))
        }
    }
    /// Contract test: a failed terminal save after deletion still closes the kernel lease.
    @Test func deletionDuringGenerationDoesNotLeakOwnershipOrRecreateTheCall() async throws {
        try await withFolder { folder, locations in
            let directory = folder.deletingLastPathComponent().appendingPathComponent("leases")
            let owner = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            _ = try await owner.claim(record()); _ = try await owner.start(record())
            let lock = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first!
            try FileManager.default.removeItem(at: folder)
            var terminal = record(); terminal.phase = "failed"
            await #expect(throws: (any Error).self) { try await owner.progress(terminal) }
            let probe = Process()
            probe.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
            probe.arguments = ["-e", "use Fcntl qw(:flock); open(my $f, '+<', $ARGV[0]) or die; exit(flock($f, LOCK_EX|LOCK_NB) ? 0 : 23);", lock.path]
            #expect(try await exitStatus(of: probe) == 0)
            #expect(!FileManager.default.fileExists(atPath: folder.path))
        }
    }
    @Test func recoveryRereadsAfterAcquisitionToPreserveAConcurrentTerminalSave() async throws {
        try await withFolder { folder, locations in
            let directory = folder.deletingLastPathComponent().appendingPathComponent("leases")
            let owner = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            _ = try await owner.claim(record()); _ = try await owner.start(record())
            let stale = try Data(contentsOf: folder.appendingPathComponent(".summary-job.json"))
            var terminal = record(); terminal.phase = "failed"
            try await owner.progress(terminal)
            let observer = Files(locations: locations, disk: StaleFirstReadDisk(stale: stale), ownershipDirectory: directory)
            #expect(try await observer.load(call: "call") == terminal)
            #expect(try await owner.load(call: "call") == terminal)
        }
    }
    @Test func copiedMoveKeepsLiveOwnershipAtTheResolvedDestination() async throws {
        try await withFolder { folder, locations in
            let directory = folder.deletingLastPathComponent().appendingPathComponent("leases")
            let owner = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            let observer = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            _ = try await owner.claim(record()); _ = try await owner.start(record())
            let destination = folder.appendingPathExtension("moved")
            do {
                // A cross-volume move copies inodes, unlike rename on one volume.
                try FileManager.default.copyItem(at: folder, to: destination)
                locations.folder.withLock { $0 = destination }
                try FileManager.default.removeItem(at: folder)
            }
            #expect(try await observer.load(call: "call")?.phase == "running")
            try await owner.publish(record(), notes: "moved result")
            var terminal = record(); terminal.phase = "succeeded"
            try await owner.progress(terminal)
            #expect(try await observer.load(call: "call") == terminal)
            #expect(!FileManager.default.fileExists(atPath: folder.path))
        }
    }
    /// Contract test: exec closes the ownership descriptor even without spawn close-all flags.
    @Test func ownershipDescriptorsAreCloseOnExec() async throws {
        try await withFolder { folder, locations in
            let directory = folder.deletingLastPathComponent().appendingPathComponent("leases")
            let owner = Files(locations: locations, disk: FileDisk(), ownershipDirectory: directory)
            _ = try await owner.claim(record()); _ = try await owner.start(record())
            let status = try { () throws -> Int32 in
                let paths = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
                let path: URL = try #require(paths.first)
                let controlURL = directory.appendingPathComponent("inheritable-control")
                let control = open(controlURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
                guard control >= 0 else { throw POSIXError(.EIO) }
                defer { close(control) }
                let script = "my @a=stat($ARGV[0]); my @c=stat($ARGV[1]); my $control=0; opendir(my $d, '/dev/fd') or die; for my $fd (readdir($d)) { next unless $fd =~ /^\\d+$/ && $fd > 2; open(my $h, '<&', $fd) or next; my @b=stat($h); next unless @b; exit 42 if $a[0]==$b[0] && $a[1]==$b[1]; $control=1 if $c[0]==$b[0] && $c[1]==$b[1]; } exit($control ? 0 : 43);"
                let words = ["/usr/bin/perl", "-e", script, path.path(percentEncoded: false), controlURL.path]
                let arguments = words.map { $0.withCString { strdup($0)! } }
                defer { arguments.forEach { free($0) } }
                var argv: [UnsafeMutablePointer<CChar>?] = arguments.map { $0 } + [nil]
                var child: pid_t = 0
                // Deliberately no CLOEXEC_DEFAULT: the lease itself must prohibit inheritance.
                var emptyEnvironment: [UnsafeMutablePointer<CChar>?] = [nil]
                let result = posix_spawn(&child, arguments[0], nil, nil, &argv, &emptyEnvironment)
                guard result == 0 else { throw POSIXError(POSIXErrorCode(rawValue: result) ?? .EIO) }
                var status: Int32 = 0
                while waitpid(child, &status, 0) == -1 { if errno != EINTR { throw POSIXError(.ECHILD) } }
                return status
            }()
            #expect(status == 0)
            await owner.release(job: "job", call: "call", input: "input")
        }
    }
    @Test(arguments: ["claim", "running", "checkpoint"])
    func durableWriteFailuresAreVisible(stage: String) async throws {
        try await withFolder { folder, locations in
            let disk = FailingDisk(), files = Files(locations: locations, disk: disk, ownershipDirectory: folder.deletingLastPathComponent().appendingPathComponent("leases"))
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
    func withFolder<Value: Sendable>(call: String, _ work: @Sendable (URL) throws -> Value) async throws -> Value {
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
    do {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data("original transcript".utf8).write(to: folder.appendingPathComponent("transcript.md"))
    }
    try await withCleanup { try await body(folder, Location(folder)) } cleanup: { try FileManager.default.removeItem(at: root) }
}

private final class StaleFirstReadDisk: Disk, Sendable {
    private let stale: Mutex<Data?>
    private let base = FileDisk()
    init(stale: Data) { self.stale = Mutex(stale) }
    func read(_ url: URL) throws -> Data {
        if let data = stale.withLock({ value in let data = value; value = nil; return data }) { return data }
        return try base.read(url)
    }
    func exists(_ url: URL) throws -> Bool { try base.exists(url) }
    func create(_ data: Data, at url: URL) throws -> Bool { try base.create(data, at: url) }
    func replace(_ data: Data, at url: URL) throws { try base.replace(data, at: url) }
}
