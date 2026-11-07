import BlockingTestWork
import Foundation
import Darwin
import Preferences
import SummaryFiles
import SummaryJobs
import Testing
@testable import Composer

@Suite struct SummaryStorageTests {
    @Test func productionRenameDeleteAndPartialMoveCoordinatePublication() async throws {
        try await withComposeFolder { root in
            let canonical = await offPool { root.resolvingSymlinksInPath() }
            let source = canonical.appendingPathComponent("source"), destination = canonical.appendingPathComponent("destination")
            let latest = "1970.01.01-0001", oldest = "1970.01.01-0000"
            let journal = root.appendingPathComponent("folders.json")
            try await offPool {
                for path in [source.appendingPathComponent(latest), source.appendingPathComponent(oldest), destination.appendingPathComponent(oldest)] {
                    try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
                    try Data("original".utf8).write(to: path.appendingPathComponent("transcript.md"))
                }
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            let files = Files(locations: storage, disk: FileDisk())
            let record = Record(job: "job", call: latest, input: "input", snapshot: Data(), phase: "pending")
            _ = try await files.claim(record); _ = try await files.start(record)
            // The older destination collision fails only after the newer call moved.
            await #expect(throws: (any Error).self) { try await storage.move(to: destination, commit: {}) }
            try await files.publish(record, notes: "complete after partial move")
            let movedLocation = try await storage.location(id: latest)
            #expect(try await sameDirectory(movedLocation, destination.appendingPathComponent(latest)))
            #expect(await offPool { !FileManager.default.fileExists(atPath: source.appendingPathComponent(latest).path) })
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            let recoveredLocation = try await recovered.location(id: latest)
            #expect(try await sameDirectory(recoveredLocation, destination.appendingPathComponent(latest)))
            try await recovered.rename(id: latest, title: "renamed")
            let restoredFiles = Files(locations: recovered, disk: FileDisk())
            try await restoredFiles.publish(record, notes: "complete after rename")
            let renamed = try await recovered.location(id: latest)
            #expect(try await offPool { try String(contentsOf: renamed.appendingPathComponent("summary.md"), encoding: .utf8) }.hasSuffix("complete after rename"))
            #expect(try await offPool { try String(contentsOf: renamed.appendingPathComponent("transcript.md"), encoding: .utf8) } == "original")
            try await recovered.delete(id: latest)
            await #expect(throws: (any Error).self) { try await restoredFiles.publish(record, notes: "late") }
            #expect(await offPool { !FileManager.default.fileExists(atPath: renamed.path) })
        }
    }
    @Test func preferenceCommitFailureStillResolvesMovedCall() async throws {
        try await withComposeFolder { root in
            let canonical = await offPool { root.resolvingSymlinksInPath() }
            let source = canonical.appendingPathComponent("source"), destination = canonical.appendingPathComponent("destination"), id = "1970.01.01-0000"
            try await offPool {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt)
            await #expect(throws: ScriptFailure.failed) { try await storage.move(to: destination, commit: { throw ScriptFailure.failed }) }
            #expect(try await sameDirectory(storage.location(id: id), destination.appendingPathComponent(id)))
            try await storage.move(to: destination, commit: {})
            #expect(try await sameDirectory(storage.location(id: id), destination.appendingPathComponent(id)))
        }
    }
    @Test func summaryPreferenceSaveMergesFreshRecordingFieldsAndPreservesCorruption() async throws {
        try await withComposeFolder { root in
            let url = root.appendingPathComponent("preferences.json")
            let storage = await offPool { PreferencesStore(fileURL: url) }
            let preferences = SummaryPreferences(storage: storage)
            let old = try await preferences.load()
            try await offPool { try storage.write(Preferences(automaticRecording: false, liveText: false, callsFolder: root)) }
            var edited = old; edited.enabled = true; edited.primary.model = "editable"
            try await preferences.save(edited)
            let current = storage.read()
            #expect(!current.automaticRecording && !current.liveText)
            #expect(current.callsFolder == root)
            #expect(current.notes.primary.model == "editable")
            let corrupt = Data("{corrupt preference".utf8)
            try await offPool { try corrupt.write(to: url) }
            await #expect(throws: (any Error).self) { try await preferences.load() }
            await #expect(throws: (any Error).self) { try await preferences.save(old) }
            #expect(try await offPool { try Data(contentsOf: url) } == corrupt)
        }
    }
    @Test func pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try await offPool { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk()), store = SummaryJobStore(files: files)
            let slot = Job.Runtime(kind: "compatibleAPI", model: "saved-model", program: "", endpoint: "http://127.0.0.1", credentialVariable: "REFERENCE_ONLY")
            let job = Job(id: "job", call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: false, primary: slot, fallback: slot)
            #expect(try await store.claim(job).owned)
            let pending = try #require(try await files.load(call: id))
            #expect(try store.state(pending).job == job)
            #expect(try await store.start(job))
            let interrupted = try #require(try await files.load(call: id))
            #expect(try store.state(interrupted).phase == .interrupted)
            #expect(try await store.start(job) == false)
        }
    }
}

private func sameDirectory(_ left: URL, _ right: URL) async throws -> Bool {
    try await offPool {
        var lhs = stat(), rhs = stat()
        guard stat(left.path, &lhs) == 0, stat(right.path, &rhs) == 0 else { throw CocoaError(.fileReadUnknown) }
        return lhs.st_dev == rhs.st_dev && lhs.st_ino == rhs.st_ino
    }
}
