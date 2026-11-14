@testable import Calls
import CallsStorage
import Darwin
import Foundation
import Preferences
import Recordings
import SettingsUI
import SummaryFiles
import SummaryJobs
import Synchronization
import Testing
@testable import Composer

/// The calls storage composed with Recordings, Preferences and call notes.
@Suite struct CallsStorageWiringTests {
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
            let storage = callsStorage(folder: source, timeZone: .gmt, journal: journal, trash: removeForTrash, writeJournal: { record, url in
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
            let recovered = callsStorage(folder: preferences.read().callsFolder, timeZone: .gmt, journal: journal, trash: removeForTrash)
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
            let storage = callsStorage(folder: source, timeZone: .gmt, journal: root.appendingPathComponent("roots.json"), trash: removeForTrash)
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
            #expect(try await storage.prepareMove(to: destination).filter { !$0.inDestination }.map(\.id) == [b])
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
    @Test func recordingsStopsAtTheCallWhoseSourceDeletionFails() async throws {
        try await withComposeFolder { temporaryRoot in
            let root = temporaryRoot.resolvingSymlinksInPath()
            let source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let ids = ["1970.01.01-0000", "1970.01.01-0001", "1970.01.01-0002"]
            let retired = Mutex<URL?>(nil), stored = Mutex(false)
            do {
                for id in ids {
                    try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                    try Data(id.utf8).write(to: source.appendingPathComponent(id + "/audio"))
                }
                try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            }
            let storage = CallsStorage(folder: source, journal: root.appendingPathComponent("moves.json"),
                writeJournal: { try JSONEncoder().encode($0).write(to: $1, options: .atomic) },
                makeCalls: { folder in
                    Calls(folder: folder, timeZone: .gmt,
                        duration: { _ in 0 },
                        transcript: { _ in [] },
                        disk: CallsDisk(
                            children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                            values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                            copy: { try FileManager.default.copyItem(at: $0, to: $1) },
                            rename: { from, to in
                            guard renamex_np(from.path, to.path, UInt32(RENAME_EXCL)) == 0 else { throw POSIXError(.EIO) }
                            if from.lastPathComponent == ids[1], to.lastPathComponent.hasSuffix("-source") {
                                retired.withLock { $0 = to }
                            }
                        },
                            trash: { _ in throw POSIXError(.EPERM) },
                            remove: { url in
                            if retired.withLock({ $0 }) == url { throw POSIXError(.EIO) }
                            try FileManager.default.removeItem(at: url)
                        }))
                })
            let handler = RecordingsEffectHandler(calls: SummaryCalls(storage: storage, deleted: { _ in }), reserve: { true }, release: {},
                storeFolder: { _ in stored.withLock { $0 = true } }, describe: russianSettings.callsFailure)
            var state = RecordingsState(callsFolder: source)
            var events: [RecordingsEvent] = []
            func send(_ event: RecordingsEvent) async {
                var next: RecordingsEvent? = event
                while let event = next {
                    events.append(event)
                    let (changed, effect) = recordingsReducer { SettingsText(language: .russian) }.reduce(state, event)
                    state = changed; next = nil
                    if let effect { for await result in handler.handle(effect) { next = result } }
                }
            }
            await send(.chooseFolder(target))
            await send(.confirmMove)
            #expect(events.contains(.callMoveFailed(id: ids[1], reason: POSIXError(.EIO).localizedDescription)))
            #expect(state.phase == .failedMove)
            #expect(state.failure == .init(id: ids[1], reason: POSIXError(.EIO).localizedDescription))
            #expect(state.move?.completed.map(\.id) == [ids[0]])
            #expect(state.move?.remaining.map(\.id) == Array(ids.dropFirst()))
            #expect(state.callsFolder == source)
            #expect(!stored.withLock { $0 })
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path) == [ids[0]])
            for id in ids.dropFirst() {
                #expect(try Data(contentsOf: source.appendingPathComponent(id + "/audio")) == Data(id.utf8))
            }
        }
    }

    @Test func pendingSnapshotRetainsConfigurationAndRunningRecoveryDoesNotReplay() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let files = Files(locations: callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let store = SummariesFilesPort(files: files, makeID: { "fresh" })
            let slot = Job.Runtime(kind: "compatibleAPI", model: "saved-model", program: "", endpoint: "http://127.0.0.1", credentialVariable: "REFERENCE_ONLY")
            let job = Job(id: "job", call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: false, primary: slot, fallback: slot)
            #expect(try await store.claim(job).owned)
            #expect(try await store.load(call: id)?.job == job)
            #expect(try await store.start(job))
            #expect(try await files.load(call: id)?.phase == "running")
            await store.release(job)
            #expect(try await store.load(call: id)?.stage == .interrupted)
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
