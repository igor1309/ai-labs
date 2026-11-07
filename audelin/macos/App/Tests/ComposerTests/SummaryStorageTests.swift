import BlockingTestWork
import Calls
import Foundation
import Darwin
import Preferences
import Recordings
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
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let record = Record(job: "job", call: latest, input: "input", snapshot: Data(), phase: "pending")
            _ = try await files.claim(record); _ = try await files.start(record)
            #expect(try await storage.prepareMove(to: destination).map(\.id) == [latest, oldest])
            _ = try await storage.move(id: latest, to: destination)
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: oldest, to: destination) }
            try await files.publish(record, notes: "complete after partial move")
            let movedLocation = try await storage.location(id: latest)
            #expect(try await sameDirectory(movedLocation, destination.appendingPathComponent(latest)))
            #expect(await offPool { !FileManager.default.fileExists(atPath: source.appendingPathComponent(latest).path) })
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            let recoveredLocation = try await recovered.location(id: latest)
            #expect(try await sameDirectory(recoveredLocation, destination.appendingPathComponent(latest)))
            try await recovered.rename(id: latest, title: "renamed")
            let restoredFiles = Files(locations: recovered, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            #expect(try await restoredFiles.load(call: latest)?.phase == "running")
            try await files.publish(record, notes: "complete after rename")
            let renamed = try await recovered.location(id: latest)
            #expect(try await offPool { try String(contentsOf: renamed.appendingPathComponent("summary.md"), encoding: .utf8) }.hasSuffix("complete after rename"))
            #expect(try await offPool { try String(contentsOf: renamed.appendingPathComponent("transcript.md"), encoding: .utf8) } == "original")
            try await recovered.delete(id: latest)
            await #expect(throws: (any Error).self) { try await files.publish(record, notes: "late") }
            #expect(await offPool { !FileManager.default.fileExists(atPath: renamed.path) })
        }
    }
    @Test func preferenceCommitFailureRetainsSourceAcrossRestartAndALaterMove() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json")
            let id = "1970.01.01-0000", fresh = "1970.01.01-0001"
            try await offPool {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            _ = try await storage.move(id: id, to: destination)
            await #expect(throws: ScriptFailure.failed) { try await storage.commitFolder(destination, commit: { throw ScriptFailure.failed }) }
            try await offPool { try FileManager.default.createDirectory(at: source.appendingPathComponent(fresh), withIntermediateDirectories: true) }
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            #expect(try await sameDirectory(recovered.location(id: id), destination.appendingPathComponent(id)))
            #expect(try await sameDirectory(recovered.location(id: fresh), source.appendingPathComponent(fresh)))
            #expect(try await recovered.list().map(\.id) == [fresh, id])
            #expect(try await recovered.prepareMove(to: destination).map(\.id) == [fresh])
            await #expect(throws: (any Error).self) { try await recovered.commitFolder(destination, commit: { Issue.record("Abandoned a source call") }) }
            _ = try await recovered.move(id: fresh, to: destination)
            try await recovered.commitFolder(destination, commit: {})
            #expect(try await sameDirectory(recovered.location(id: fresh), destination.appendingPathComponent(fresh)))
        }
    }

    @Test func failedJournalFinalizationRetainsRootsAndRestoresTheConfiguredFolder() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json"), preferencesURL = root.appendingPathComponent("preferences.json")
            let id = "1970.01.01-0000", fresh = "1970.01.01-0001"
            let preferences = await offPool { PreferencesStore(fileURL: preferencesURL) }
            try await offPool {
                try preferences.write(Preferences(automaticRecording: false, liveText: false, callsFolder: source))
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, writeJournal: { record, url in
                guard !record.moves.isEmpty else { throw ScriptFailure.failed }
                try JSONEncoder().encode(record).write(to: url, options: .atomic)
            })
            _ = try await storage.move(id: id, to: destination)
            await #expect(throws: ScriptFailure.failed) {
                try await storage.commitFolder(destination) { try preferences.updateCallsFolder(destination) }
            }
            #expect(preferences.read().callsFolder == destination)
            try await offPool { try FileManager.default.createDirectory(at: destination.appendingPathComponent(fresh), withIntermediateDirectories: true) }
            let recovered = SummaryStorage(folder: preferences.read().callsFolder, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            #expect(try await recovered.list().map(\.id) == [fresh, id])
            #expect(try await sameDirectory(recovered.location(id: fresh), destination.appendingPathComponent(fresh)))
            try await recovered.commitFolder(destination, commit: {})
        }
    }

    @Test func restoreIncludesConfiguredRecordingFolderEvenWhenJournalNamesOnlyAnotherCall() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json"), id = "1970.01.01-0000"
            try await offPool {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
                let move = Calls.Move(source: destination.appendingPathComponent("1970.01.01-0001"),
                                      target: root.appendingPathComponent("other/1970.01.01-0001"),
                                      temporary: root.appendingPathComponent("other/.audelin-move-test"), phase: .source)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: ["1970.01.01-0001": move])).write(to: journal)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await storage.restore()
            #expect(try await storage.list().map(\.id) == [id])
            #expect(try await sameDirectory(storage.location(id: id), source.appendingPathComponent(id)))
        }
    }

    @Test(arguments: ["call", "nested", "symlink"])
    func destinationInsideAnyCallIsRejectedBeforeTheFirstMove(kind: String) async throws {
        try await withComposeFolder { root in
            let oldest = "1970.01.01-0000", newer = "1970.01.01-0001"
            let outer = root.appendingPathComponent(newer), nested = outer.appendingPathComponent("nested")
            let link = root.appendingPathComponent("link")
            try await offPool {
                try FileManager.default.createDirectory(at: root.appendingPathComponent(oldest), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
                try Data([1, 2, 3]).write(to: root.appendingPathComponent(oldest + "/audio"))
                try FileManager.default.createSymbolicLink(at: link, withDestinationURL: nested)
            }
            let storage = SummaryStorage(folder: root, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"))
            let target = kind == "call" ? outer : kind == "nested" ? nested : link
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: oldest, to: target) }
            #expect(try await storage.list().map(\.id) == [newer, oldest])
            #expect(try await offPool { try Data(contentsOf: root.appendingPathComponent(oldest + "/audio")) } == Data([1, 2, 3]))
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: nested.path) }.isEmpty)
            #expect(await offPool { !FileManager.default.fileExists(atPath: root.appendingPathComponent("roots.json").path) })
        }
    }

    @Test func retryPreparationExcludesDestinationCallsAndKeepsExactTotals() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let a = "1970.01.01-0000", b = "1970.01.01-0001", c = "1970.01.01-0002"
            try await offPool {
                for (folder, id, count) in [(source, a, 3), (source, b, 7), (destination, c, 11)] {
                    try FileManager.default.createDirectory(at: folder.appendingPathComponent(id), withIntermediateDirectories: true)
                    try Data(repeating: 1, count: count).write(to: folder.appendingPathComponent(id + "/audio"))
                }
                try Data([99]).write(to: destination.appendingPathComponent(b))
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"))
            var state = RecordingsState(callsFolder: source)
            let handler = RecordingsEffectHandler(calls: SummaryCalls(storage: storage), reserve: { true }, release: {},
                storeFolder: { folder in try await storage.commitFolder(folder, commit: {}) })
            var observedMoves: [CallsFolderMove] = []
            func send(_ event: RecordingsEvent) async {
                var next: RecordingsEvent? = event
                while let event = next {
                    let (changed, effect) = RecordingsReducer.reduce(state, event)
                    state = changed; next = nil
                    if let move = state.move { observedMoves.append(move) }
                    if let effect { for await result in handler.handle(effect) { next = result } }
                }
            }
            await send(.chooseFolder(destination))
            #expect(state.move?.remaining.map(\.id) == [a, b])
            #expect(state.move?.totalCalls == 2 && state.move?.totalBytes == 10)
            await send(.confirmMove)
            #expect(state.phase == .failedMove)
            #expect(state.move?.completed.map(\.id) == [a])
            #expect(try await storage.prepareMove(to: destination).map(\.id) == [b])
            await #expect(throws: (any Error).self) { _ = try await storage.location(id: c) }
            try await offPool { try FileManager.default.removeItem(at: destination.appendingPathComponent(b)) }
            let retryStart = observedMoves.count
            await send(.retryMove)
            let retried = Array(observedMoves.dropFirst(retryStart))
            #expect(!retried.isEmpty)
            #expect(retried.allSatisfy { $0.totalCalls == 2 && $0.totalBytes == 10 })
            #expect(Set(retried.flatMap { $0.remaining.map(\.id) }) == [b])
            #expect(retried.last?.completed.map(\.id) == [a, b])
            #expect(retried.last?.movedBytes == 10)
            #expect(state.phase == .idle)
            #expect(state.callsFolder == destination)
            #expect(state.calls.map(\.id) == [c, b, a])
            #expect(try await offPool { try Data(contentsOf: destination.appendingPathComponent(c + "/audio")) } == Data(repeating: 1, count: 11))
        }
    }
    @Test func summariesResolveBeforeBetweenAndAfterMovesAndCompletedRootsSurviveRestart() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json")
            let ids = ["1970.01.01-0000", "1970.01.01-0001"]
            try await offPool {
                for id in ids {
                    try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                    try Data("transcript".utf8).write(to: source.appendingPathComponent(id + "/transcript.md"))
                }
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let records = ids.map { Record(job: $0, call: $0, input: "input", snapshot: Data(), phase: "pending") }
            for record in records { _ = try await files.claim(record); _ = try await files.start(record) }
            for id in ids { #expect(try await sameDirectory(storage.location(id: id), source.appendingPathComponent(id))) }
            _ = try await storage.move(id: ids[0], to: destination)
            try await files.publish(records[0], notes: "published between moves")
            #expect(try await sameDirectory(storage.location(id: ids[0]), destination.appendingPathComponent(ids[0])))
            #expect(try await sameDirectory(storage.location(id: ids[1]), source.appendingPathComponent(ids[1])))
            _ = try await storage.move(id: ids[1], to: destination)
            try await storage.commitFolder(destination, commit: {})
            try await offPool { try FileManager.default.removeItem(at: source) }
            let restored = SummaryStorage(folder: destination, timeZone: .gmt, journal: journal)
            try await restored.restore()
            #expect(try await restored.list().map(\.id) == ids.reversed())
            let recoveredFiles = Files(locations: restored, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            #expect(try await recoveredFiles.load(call: ids[1])?.phase == "running")
            try await files.publish(records[1], notes: "published after completion")
            #expect(try await offPool { try String(contentsOf: destination.appendingPathComponent(ids[0] + "/summary.md"), encoding: .utf8) }.hasSuffix("published between moves"))
            #expect(try await offPool { try String(contentsOf: destination.appendingPathComponent(ids[1] + "/summary.md"), encoding: .utf8) }.hasSuffix("published after completion"))
        }
    }

    @Test func invalidDestinationOrUnwritableJournalLeavesSourceRootsAndCallsIntact() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let id = "1970.01.01-0000", journalParent = root.appendingPathComponent("file")
            try await offPool {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
                try Data([1]).write(to: journalParent)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journalParent.appendingPathComponent("roots.json"))
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: journalParent) }
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: destination) }
            #expect(try await storage.list().map(\.id) == [id])
            #expect(try await sameDirectory(storage.location(id: id), source.appendingPathComponent(id)))
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: destination.path) }.isEmpty)
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
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases")), store = SummaryJobStore(files: files)
            let slot = Job.Runtime(kind: "compatibleAPI", model: "saved-model", program: "", endpoint: "http://127.0.0.1", credentialVariable: "REFERENCE_ONLY")
            let job = Job(id: "job", call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: false, primary: slot, fallback: slot)
            #expect(try await store.claim(job).owned)
            let pending = try #require(try await files.load(call: id))
            #expect(try store.state(pending).job == job)
            #expect(try await store.start(job))
            let active = try #require(try await files.load(call: id))
            #expect(try store.state(active).phase == .running)
            await store.release(job)
            let interrupted = try #require(try await files.load(call: id))
            #expect(try store.state(interrupted).phase == .interrupted)
            #expect(try await store.start(job) == false)
        }
    }
}

func sameDirectory(_ left: URL, _ right: URL) async throws -> Bool {
    try await offPool {
        var lhs = stat(), rhs = stat()
        guard stat(left.path, &lhs) == 0, stat(right.path, &rhs) == 0 else { throw CocoaError(.fileReadUnknown) }
        return lhs.st_dev == rhs.st_dev && lhs.st_ino == rhs.st_ino
    }
}
