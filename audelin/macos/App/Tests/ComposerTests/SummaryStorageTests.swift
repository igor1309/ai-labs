import BlockingTestWork
import Calls
import Foundation
import Darwin
import Preferences
import Recordings
import SummaryFiles
import SummaryJobs
import Synchronization
import SettingsUI
import Testing
@testable import Composer

@Suite struct SummaryStorageTests {
    @Test(arguments: [false, true])
    func legacyJournalMigratesSplitCallsAndPublishesTheirSummaries(completed: Bool) async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let moved = "1970.01.01-0000", remaining = "1970.01.01-0001"
            let journal = root.appendingPathComponent("summary-folders.json")
            // A completed legacy move can persist its roots before preferences;
            // a later recording then still lands in the configured source.
            let legacyRoots = completed ? [destination] : [destination, source]
            let calls = [(destination, moved), (source, remaining)]
            do {
                for (folder, id) in calls {
                    try FileManager.default.createDirectory(at: folder.appendingPathComponent(id), withIntermediateDirectories: true)
                    try Data("transcript".utf8).write(to: folder.appendingPathComponent(id + "/transcript.md"))
                }
                try JSONEncoder().encode(legacyRoots).write(to: journal)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
            try await storage.restore()
            let migrated = try JSONDecoder().decode(SummaryStorage.Journal.self, from: Data(contentsOf: journal))
            #expect(migrated.retainedRoots.map(\.path) == legacyRoots.map(\.path))
            #expect(migrated.owners.mapValues(\.path) == (completed ? [moved: destination.path] : [moved: destination.path, remaining: source.path]))
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
            try await recovered.restore()
            #expect(try await recovered.list().map(\.id) == [remaining, moved])
            let files = Files(locations: recovered, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            for (folder, id) in calls {
                #expect(try await sameDirectory(recovered.location(id: id), folder.appendingPathComponent(id)))
                let job = Record(job: id, call: id, input: "input", snapshot: Data(), phase: "pending")
                _ = try await files.claim(job); _ = try await files.start(job)
                try await files.publish(job, notes: "summary for " + id)
                #expect(try String(contentsOf: folder.appendingPathComponent(id + "/summary.md"), encoding: .utf8).hasSuffix("summary for " + id))
            }
            #expect(try await recovered.prepareMove(to: destination).map(\.id) == [remaining])
            _ = try await recovered.move(id: remaining, to: destination)
            try await recovered.commitFolder(destination, commit: {})
            #expect(try await recovered.list().map(\.id) == [remaining, moved])
            #expect(try String(contentsOf: destination.appendingPathComponent(remaining + "/summary.md"), encoding: .utf8).hasSuffix("summary for " + remaining))
        }
    }

    @Test func unavailableLegacyRootDoesNotReplaceItsJournal() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("offline")
            let journal = root.appendingPathComponent("summary-folders.json")
            let data = try JSONEncoder().encode([destination, source])
            do {
                try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
                try data.write(to: journal)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
            await #expect(throws: (any Error).self) { try await storage.restore() }
            #expect(try Data(contentsOf: journal) == data)
        }
    }

    @Test func productionRenameDeleteAndPartialMoveCoordinatePublication() async throws {
        try await withComposeFolder { root in
            let canonical = root.resolvingSymlinksInPath()
            let source = canonical.appendingPathComponent("source"), destination = canonical.appendingPathComponent("destination")
            let latest = "1970.01.01-0001", oldest = "1970.01.01-0000"
            let journal = root.appendingPathComponent("folders.json")
            do {
                for path in [source.appendingPathComponent(latest), source.appendingPathComponent(oldest), destination.appendingPathComponent(oldest)] {
                    try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
                    try Data("original".utf8).write(to: path.appendingPathComponent("transcript.md"))
                }
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let record = Record(job: "job", call: latest, input: "input", snapshot: Data(), phase: "pending")
            _ = try await files.claim(record); _ = try await files.start(record)
            #expect(try await storage.prepareMove(to: destination).map(\.id) == [latest, oldest])
            _ = try await storage.move(id: latest, to: destination)
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: oldest, to: destination) }
            try await files.publish(record, notes: "complete after partial move")
            let movedLocation = try await storage.location(id: latest)
            #expect(try await sameDirectory(movedLocation, destination.appendingPathComponent(latest)))
            #expect(!FileManager.default.fileExists(atPath: source.appendingPathComponent(latest).path))
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
            try await recovered.restore()
            let recoveredLocation = try await recovered.location(id: latest)
            #expect(try await sameDirectory(recoveredLocation, destination.appendingPathComponent(latest)))
            try await recovered.rename(id: latest, title: "renamed")
            let restoredFiles = Files(locations: recovered, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            #expect(try await restoredFiles.load(call: latest)?.phase == "running")
            try await files.publish(record, notes: "complete after rename")
            let renamed = try await recovered.location(id: latest)
            #expect(try String(contentsOf: renamed.appendingPathComponent("summary.md"), encoding: .utf8).hasSuffix("complete after rename"))
            #expect(try String(contentsOf: renamed.appendingPathComponent("transcript.md"), encoding: .utf8) == "original")
            try await recovered.delete(id: latest)
            await #expect(throws: (any Error).self) { try await files.publish(record, notes: "late") }
            #expect(!FileManager.default.fileExists(atPath: renamed.path))
        }
    }
    @Test func preferenceCommitFailureRetainsSourceAcrossRestartAndALaterMove() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json")
            let id = "1970.01.01-0000", fresh = "1970.01.01-0001"
            do {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
            _ = try await storage.move(id: id, to: destination)
            await #expect(throws: ScriptFailure.failed) { try await storage.commitFolder(destination, commit: { throw ScriptFailure.failed }) }
            try FileManager.default.createDirectory(at: source.appendingPathComponent(fresh), withIntermediateDirectories: true)
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
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

    @Test func failedJournalFinalizationReportsTheCommittedFolderAndAllowsChoosingTheOriginalFolder() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json"), preferencesURL = root.appendingPathComponent("preferences.json")
            let id = "1970.01.01-0000", fresh = "1970.01.01-0001"
            let preferences = PreferencesStore(fileURL: preferencesURL)
            do {
                try preferences.write(Preferences(automaticRecording: false, liveText: false, callsFolder: source))
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash, writeJournal: { record, url in
                guard !record.moves.isEmpty else { throw ScriptFailure.failed }
                try JSONEncoder().encode(record).write(to: url, options: .atomic)
            })
            var state = RecordingsState(callsFolder: source)
            let handler = RecordingsEffectHandler(calls: SummaryCalls(storage: storage, deleted: { _ in }), reserve: { true }, release: {},
                storeFolder: { folder in try await storage.commitFolder(folder) { try preferences.updateCallsFolder(folder) } }, describe: russianSettings.callsFailure)
            func send(_ event: RecordingsEvent) async {
                var next: RecordingsEvent? = event
                while let event = next {
                    let (changed, effect) = recordingsReducer { SettingsText(language: .russian) }.reduce(state, event)
                    state = changed; next = nil
                    if let effect { for await result in handler.handle(effect) { next = result } }
                }
            }
            await send(.chooseFolder(destination))
            await send(.confirmMove)
            #expect(state.phase == .idle)
            #expect(state.failure == nil)
            #expect(state.callsFolder == preferences.read().callsFolder)
            #expect(preferences.read().callsFolder == destination)
            try FileManager.default.createDirectory(at: destination.appendingPathComponent(fresh), withIntermediateDirectories: true)
            let recovered = SummaryStorage(folder: preferences.read().callsFolder, timeZone: .gmt, journal: journal, trash: removeForTrash)
            try await recovered.restore()
            #expect(try await recovered.list().map(\.id) == [fresh, id])
            #expect(try await sameDirectory(recovered.location(id: fresh), destination.appendingPathComponent(fresh)))
            try await recovered.commitFolder(destination, commit: {})
            await send(.chooseFolder(source))
            #expect(state.phase == .askingMove)
            #expect(state.move?.remaining.map(\.id) == [id, fresh])
            await send(.confirmMove)
            #expect(state.phase == .idle)
            #expect(state.failure == nil)
            #expect(state.callsFolder == source)
            #expect(state.callsFolder == preferences.read().callsFolder)
            #expect(try await storage.list().map(\.id) == [fresh, id])
        }
    }

    @Test func restoreIncludesConfiguredRecordingFolderEvenWhenJournalNamesOnlyAnotherCall() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json"), id = "1970.01.01-0000"
            do {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
                let move = Calls.Move(source: destination.appendingPathComponent("1970.01.01-0001"),
                                      target: root.appendingPathComponent("other/1970.01.01-0001"),
                                      temporary: root.appendingPathComponent("other/.audelin-move-test"), phase: .source)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: ["1970.01.01-0001": move])).write(to: journal)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
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
            do {
                try FileManager.default.createDirectory(at: root.appendingPathComponent(oldest), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
                try Data([1, 2, 3]).write(to: root.appendingPathComponent(oldest + "/audio"))
                try FileManager.default.createSymbolicLink(at: link, withDestinationURL: nested)
            }
            let storage = SummaryStorage(folder: root, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"), trash: removeForTrash)
            let target = kind == "call" ? outer : kind == "nested" ? nested : link
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: oldest, to: target) }
            #expect(try await storage.list().map(\.id) == [newer, oldest])
            #expect(try Data(contentsOf: root.appendingPathComponent(oldest + "/audio")) == Data([1, 2, 3]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: nested.path).isEmpty)
            #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("roots.json").path))
        }
    }

    @Test func retryPreparationExcludesDestinationCallsAndKeepsExactTotals() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let a = "1970.01.01-0000", b = "1970.01.01-0001", c = "1970.01.01-0002"
            do {
                for (folder, id, count) in [(source, a, 3), (source, b, 7), (destination, c, 11)] {
                    try FileManager.default.createDirectory(at: folder.appendingPathComponent(id), withIntermediateDirectories: true)
                    try Data(repeating: 1, count: count).write(to: folder.appendingPathComponent(id + "/audio"))
                }
                try Data([99]).write(to: destination.appendingPathComponent(b))
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"), trash: removeForTrash)
            var state = RecordingsState(callsFolder: source)
            let handler = RecordingsEffectHandler(calls: SummaryCalls(storage: storage, deleted: { _ in }), reserve: { true }, release: {},
                storeFolder: { folder in try await storage.commitFolder(folder, commit: {}) }, describe: russianSettings.callsFailure)
            var observedMoves: [CallsFolderMove] = []
            func send(_ event: RecordingsEvent) async {
                var next: RecordingsEvent? = event
                while let event = next {
                    let (changed, effect) = recordingsReducer { SettingsText(language: .russian) }.reduce(state, event)
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
            try FileManager.default.removeItem(at: destination.appendingPathComponent(b))
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
            #expect(try Data(contentsOf: destination.appendingPathComponent(c + "/audio")) == Data(repeating: 1, count: 11))
        }
    }
    @Test func summariesResolveBeforeBetweenAndAfterMovesAndCompletedRootsSurviveRestart() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let journal = root.appendingPathComponent("roots.json")
            let ids = ["1970.01.01-0000", "1970.01.01-0001"]
            do {
                for id in ids {
                    try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                    try Data("transcript".utf8).write(to: source.appendingPathComponent(id + "/transcript.md"))
                }
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash)
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
            try FileManager.default.removeItem(at: source)
            let restored = SummaryStorage(folder: destination, timeZone: .gmt, journal: journal, trash: removeForTrash)
            try await restored.restore()
            #expect(try await restored.list().map(\.id) == ids.reversed())
            let recoveredFiles = Files(locations: restored, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            #expect(try await recoveredFiles.load(call: ids[1])?.phase == "running")
            try await files.publish(records[1], notes: "published after completion")
            #expect(try String(contentsOf: destination.appendingPathComponent(ids[0] + "/summary.md"), encoding: .utf8).hasSuffix("published between moves"))
            #expect(try String(contentsOf: destination.appendingPathComponent(ids[1] + "/summary.md"), encoding: .utf8).hasSuffix("published after completion"))
        }
    }

    @Test func aSummaryWriteStartedDuringAMoveWaitsForItAndLandsInTheDestination() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
            try Data("transcript".utf8).write(to: source.appendingPathComponent(id + "/transcript.md"))
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            let record = Record(job: id, call: id, input: "input", snapshot: Data(), phase: "pending")
            let files = Mutex<Files?>(nil)
            let moving = Mutex(false)
            let publish = Mutex<Task<Void, any Error>?>(nil)
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"),
                                         trash: removeForTrash, writeJournal: { journal, url in
                try JSONEncoder().encode(journal).write(to: url, options: .atomic)
                guard moving.withLock({ $0 }) else { return }
                publish.withLock { task in
                    guard task == nil, let files = files.withLock({ $0 }) else { return }
                    task = Task { try await files.publish(record, notes: "written during the move") }
                }
            })
            files.withLock { $0 = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases")) }
            let summaries = try #require(files.withLock { $0 })
            _ = try await summaries.claim(record)
            _ = try await summaries.start(record)
            moving.withLock { $0 = true }
            _ = try await storage.move(id: id, to: destination)
            try await #require(publish.withLock { $0 }).value
            #expect(try String(contentsOf: destination.appendingPathComponent(id + "/summary.md"), encoding: .utf8)
                .hasSuffix("written during the move"))
            #expect(!FileManager.default.fileExists(atPath: source.appendingPathComponent(id + "/summary.md").path))
        }
    }

    @Test func invalidDestinationOrUnwritableJournalLeavesSourceRootsAndCallsIntact() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            let id = "1970.01.01-0000", journalParent = root.appendingPathComponent("file")
            do {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
                try Data([1]).write(to: journalParent)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journalParent.appendingPathComponent("roots.json"), trash: removeForTrash)
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: journalParent) }
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: destination) }
            #expect(try await storage.list().map(\.id) == [id])
            #expect(try await sameDirectory(storage.location(id: id), source.appendingPathComponent(id)))
            #expect(try FileManager.default.contentsOfDirectory(atPath: destination.path).isEmpty)
        }
    }

    @Test func summaryPreferenceSaveMergesFreshRecordingFieldsAndPreservesCorruption() async throws {
        try await withComposeFolder { root in
            let url = root.appendingPathComponent("preferences.json")
            let storage = PreferencesStore(fileURL: url)
            let preferences = SummaryPreferences(storage: storage)
            let old = try await preferences.load()
            try storage.write(Preferences(automaticRecording: false, liveText: false, callsFolder: root))
            var edited = old; edited.enabled = true; edited.primary.model = "editable"
            try await preferences.save(edited)
            let current = storage.read()
            #expect(!current.automaticRecording && !current.liveText)
            #expect(current.callsFolder == root)
            #expect(current.notes.primary.model == "editable")
            let corrupt = Data("{corrupt preference".utf8)
            try corrupt.write(to: url)
            await #expect(throws: (any Error).self) { try await preferences.load() }
            await #expect(throws: (any Error).self) { try await preferences.save(old) }
            #expect(try Data(contentsOf: url) == corrupt)
        }
    }
    @Test func pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases")), store = SummaryJobStore(files: files)
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
    do {
        var lhs = stat(), rhs = stat()
        guard stat(left.path, &lhs) == 0, stat(right.path, &rhs) == 0 else { throw CocoaError(.fileReadUnknown) }
        return lhs.st_dev == rhs.st_dev && lhs.st_ino == rhs.st_ino
    }
}
