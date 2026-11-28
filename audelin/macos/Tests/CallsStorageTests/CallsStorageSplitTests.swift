import CallFolder
import Calls
import CallsStorage
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallsStorageSplitTests {
    private let first = "1970.01.01-0000"
    private let start = Date(timeIntervalSince1970: 0)

    @Test func refusesACallOwnedByAnInactiveFolder() async throws {
        try await withStorageFolder { root in
            let active = try makeFolder("active", in: root)
            let inactive = try makeFolder("inactive", in: root)
            let call = try makeCall(first, in: inactive)
            let journal = root.appendingPathComponent("journal.json")
            try CallsStorage.writeAtomically(.init(owners: [first: inactive]), journal)
            let storage = storage(in: active, journal: journal)
            try await storage.restore()
            await #expect(throws: CallsStorage.SplitFailure.inactive(id: first)) {
                try await storage.splitTranscript(id: first)
            }
            await #expect(throws: CallsStorage.SplitFailure.inactive(id: first)) {
                try await storage.split(id: first, expectedTranscript: "", replace: unexpectedTransaction)
            }
            #expect(try await storage.list().map(\.id) == [first])
            #expect(try await sameDirectory(storage.location(id: first), call))
            #expect(try FileManager.default.contentsOfDirectory(atPath: active.path).isEmpty)
        }
    }

    @Test(arguments: [false, true])
    func refusesACallHeldByAMove(hasClaim: Bool) async throws {
        try await withStorageFolder { root in
            let active = try makeFolder("active", in: root)
            let call = try makeCall(first, in: active)
            let target = root.appendingPathComponent("offline", isDirectory: true)
            let journal = root.appendingPathComponent("journal.json")
            var saved = CallsJournal()
            if !hasClaim {
                let move = Calls.Move(source: call, target: target.appendingPathComponent(first), temporary: target.appendingPathComponent(".audelin-move-test"))
                saved.moves[first] = move
                try CallsStorage.writeAtomically(saved, journal)
            }
            let storage = storage(in: active, journal: journal, writeJournal: { _, _ in throw ScriptFailure.failed })
            try await storage.restore()
            if hasClaim {
                guard case .granted = storage.takeFolder(for: .move) else { Issue.record("move claim refused"); return }
            }
            await #expect(throws: CallsStorage.SplitFailure.heldByMove(id: first)) {
                try await storage.split(id: first, expectedTranscript: "", replace: unexpectedTransaction)
            }
            #expect(try await storage.list().map(\.id) == [first])
            #expect(try readTranscript(in: call) == "original")
            #expect(try FileManager.default.contentsOfDirectory(atPath: active.path) == [first])
            if !hasClaim { #expect(try JSONDecoder().decode(CallsJournal.self, from: Data(contentsOf: journal)) == saved) }
        }
    }

    @Test(arguments: ["changed", nil] as [String?])
    func rejectsChoicesFromAnOldTranscript(replacement: String?) async throws {
        try await withStorageFolder { root in
            let call = try makeCall(first, in: root)
            let storage = storage(in: root)
            let choices = try await storage.splitTranscript(id: first)
            #expect(choices.bytes == Data("original".utf8))
            let transcript = call.appendingPathComponent("transcript.md")
            if let replacement { try Data(replacement.utf8).write(to: transcript) }
            else { try FileManager.default.removeItem(at: transcript) }
            await #expect(throws: CallsStorage.SplitFailure.expiredTranscript(id: first)) {
                try await storage.split(id: first, expectedTranscript: choices.identity, replace: unexpectedTransaction)
            }
            #expect(try await storage.list().map(\.id) == [first])
            #expect(try await storage.text(id: first).identity != choices.identity)
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [first])
            if let replacement { #expect(try readTranscript(in: call) == replacement) }
            else { #expect(!FileManager.default.fileExists(atPath: transcript.path)) }
        }
    }

    @Test(arguments: [false, true])
    func reservesAnIDAcrossTheActiveFolderAndTheJournalAndMergesSameMinuteParts(baseTaken: Bool) async throws {
        try await withStorageFolder { root in
            let active = try makeFolder("active", in: root)
            let retained = try makeFolder("retained", in: root)
            let base = self.first
            let first = baseTaken ? base : base + "-9"
            let second = baseTaken ? base + "-5" : base
            let other = base + "-2", owned = base + "-3", moving = base + "-4"
            _ = try makeCall(first, in: active)
            _ = try makeCall(other, in: active)
            _ = try makeCall(owned, in: retained)
            let moved = try makeCall(moving, in: retained)
            let move = Calls.Move(source: active.appendingPathComponent(moving), target: moved,
                                  temporary: retained.appendingPathComponent(".audelin-move-test"), phase: .destination)
            let journal = root.appendingPathComponent("journal.json")
            let saved = CallsJournal(moves: [moving: move], owners: [owned: retained])
            try CallsStorage.writeAtomically(saved, journal)

            let storage = storage(in: active, journal: journal)
            try await storage.restore()
            let parts = try await split(storage, id: first)
            #expect(parts.first == first)
            #expect(parts.second == second)
            try await expectParts(in: storage, first: first, second: second)
            let reopened = self.storage(in: active, journal: journal)
            try await reopened.restore()
            try await expectParts(in: reopened, first: first, second: second)
            #expect(Set(try await reopened.list().map(\.id)) == [first, other, owned, moving, second])
            let merge = try await reopened.merge(ids: [second, first]) { prepared, parts in
                #expect(try parts.map { try readTranscript(in: $0) } == ["second", "first"])
                try Data("joined".utf8).write(to: prepared.appendingPathComponent("transcript.md"))
            }
            #expect(merge == first)
            #expect(Set(try await reopened.list().map(\.id)) == [first, other, owned, moving])
            #expect(try await reopened.list().first(where: { $0.id == first })?.duration == 30)
            #expect(try await reopened.originals(id: first).map(\.start) == [start, start.addingTimeInterval(15)])
            #expect(try await reopened.savedTranscript(id: first) == Data("joined".utf8))
            #expect(try JSONDecoder().decode(CallsJournal.self, from: Data(contentsOf: journal)) == saved)
        }
    }

    @Test func reconcilesAStaleJournalAfterBothPartsHavePublished() async throws {
        try await withStorageFolder { root in
            let active = try makeFolder("active", in: root)
            let stale = try makeFolder("stale", in: root)
            _ = try makeCall(first, in: active)
            let second = first + "-2", unrelated = "1970.01.01-0001"
            _ = try makeCall(unrelated, in: stale)
            let journal = root.appendingPathComponent("journal.json")
            let storage = storage(in: active, journal: journal, writeJournal: { _, _ in throw ScriptFailure.failed })
            try await storage.restore()
            let failure = await #expect(throws: Calls.SplitFailure.self) { try await split(storage, id: first) }
            guard case let .committed(parts, _) = failure else { Issue.record("expected a committed split"); return }
            #expect(parts.first == first)
            #expect(parts.second == second)
            #expect(try readTranscript(in: active.appendingPathComponent(first + " Earlier")) == "first")
            #expect(try readTranscript(in: active.appendingPathComponent(second + " Later")) == "second")
            await #expect(throws: Calls.SplitFailure.self) { try await storage.list() }

            let staleMove = Calls.Move(source: stale.appendingPathComponent(second), target: active.appendingPathComponent(second),
                                       temporary: active.appendingPathComponent(".audelin-move-test"))
            try CallsStorage.writeAtomically(.init(moves: [second: staleMove], owners: [first: stale, unrelated: stale]), journal)
            let reopened = self.storage(in: active, journal: journal)
            for _ in 0..<2 {
                try await reopened.restore()
                try await expectParts(in: reopened, first: first, second: second)
                #expect(try await reopened.list().map(\.id) == [unrelated, second, first])
                #expect(try JSONDecoder().decode(CallsJournal.self, from: Data(contentsOf: journal)) == .init(owners: [unrelated: stale]))
            }
        }
    }

    @Test func aRecordingCannotAllocateTheSecondPartsIdentityDuringTheCut() async throws {
        try await withStorageFolder { root in
            _ = try makeCall(first, in: root)
            let storage = storage(in: root)
            let secondStart = start.addingTimeInterval(15)
            let allocator = CallFolder(callsURL: root, now: { secondStart }, timeZone: .gmt,
                                       occupiedNames: { try storage.occupiedCallNames() }, disk: .system)

            let parts = try await split(storage, id: first) { offset, source, before, after in
                let claim = storage.takeFolder(for: .recording)
                #expect(claim == .refused(by: .split))
                if case let .granted(token) = claim {
                    storage.releaseFolder(token)
                    throw ScriptFailure.failed
                }
                try cutTrack(offset, source, before, after)
            }
            guard case let .granted(token) = storage.takeFolder(for: .recording) else {
                Issue.record("Recording could not claim the folder after publication")
                return
            }
            defer { storage.releaseFolder(token) }
            let recording = try allocator.make(title: "Automatic recording")
            #expect(parts.second == first + "-2")
            #expect(recording.id == first + "-3")
            #expect(try await storage.list().map(\.id) == [recording.id, parts.second, first])
        }
    }

    @Test func aRecordingCannotAllocateAnUnpublishedPartIdentityAfterInterruptedPublication() async throws {
        try await withStorageFolder { root in
            _ = try makeCall(first, in: root)
            var disk = CallsDisk.system
            disk.rename = { source, target in
                if source.lastPathComponent == "second" { throw POSIXError(.EIO) }
                try CallsDisk.system.rename(source, target)
            }
            let interrupted = storage(in: root, disk: disk)
            let failure = await #expect(throws: Calls.SplitFailure.self) { try await split(interrupted, id: first, disk: disk) }
            guard case let .committed(parts, _) = failure else {
                Issue.record("Expected publication to stop with the second part reserved")
                return
            }
            let secondStart = start.addingTimeInterval(15)
            let claim = interrupted.takeFolder(for: .recording)
            guard case let .granted(token) = claim else {
                Issue.record("Expected the recording to reach folder allocation")
                return
            }
            defer { interrupted.releaseFolder(token) }
            let allocator = CallFolder(callsURL: root, now: { secondStart }, timeZone: .gmt,
                                       occupiedNames: { try interrupted.occupiedCallNames() }, disk: .system)
            #expect(throws: Calls.SplitFailure.self) { try allocator.make(title: "Recording") }

            let reopened = storage(in: root)
            try await reopened.restore()
            #expect(try await reopened.list().map(\.id) == [parts.second, parts.first])
            #expect(try await reopened.savedTranscript(id: parts.second) == Data("second".utf8))
        }
    }

    @Test func recordingCanWinAdmissionWhileSplitWaitsForTheStorageTurn() async throws {
        try await withStorageFolder { root in
            let call = try makeCall(first, in: root)
            let admitted = AsyncStream<Bool>.makeStream()
            let turn = CallsStorageGuard.serial { admitted.continuation.yield($0) }
            let storage = storage(in: root, operation: turn)
            let choices = try await storage.splitTranscript(id: first)
            var admissions = admitted.stream.makeAsyncIterator()
            #expect(await admissions.next() == true)

            try await turn.take(.access)
            #expect(await admissions.next() == true)
            let queued = Task {
                try await storage.split(id: first, expectedTranscript: choices.identity, replace: unexpectedTransaction)
            }
            #expect(await admissions.next() == false)
            let claim = storage.takeFolder(for: .recording)
            turn.give()
            defer {
                if case let .granted(token) = claim { storage.releaseFolder(token) }
                admitted.continuation.finish()
            }
            guard case .granted = claim else {
                _ = await queued.result
                Issue.record("Recording could not claim the folder before split admission")
                return
            }
            await #expect(throws: CallsStorage.SplitFailure.busy) { try await queued.value }
            #expect(try readTranscript(in: call) == "original")
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [first])
        }
    }

    private func expectParts(in storage: CallsStorage, first: String, second: String) async throws {
        let firstFolder = try await storage.location(id: first)
        let secondFolder = try await storage.location(id: second)
        #expect(firstFolder.lastPathComponent == first + " Earlier")
        #expect(secondFolder.lastPathComponent == second + " Later")
        #expect(try readTranscript(in: firstFolder) == "first")
        #expect(try readTranscript(in: secondFolder) == "second")
        let parts = try await storage.list().filter { [first, second].contains($0.id) }
        #expect(parts.map(\.start) == [start, start])
        #expect(parts.map(\.duration) == [15, 15])
    }

    private func split(_ storage: CallsStorage, id: String, disk: CallsDisk = .system,
                       cut: @Sendable (TimeInterval, URL, URL, URL) throws -> Void = cutTrack) async throws -> CallsStorage.SplitReplacement {
        let choices = try await storage.splitTranscript(id: id)
        return try await storage.split(id: id, expectedTranscript: choices.identity) { request, register in
            let parts = try calls(in: request.root, disk: disk).split(
                id: request.id, expectedTranscript: request.expectedTranscript, firstTitle: "Earlier", secondTitle: "Later",
                reservedIDs: request.reservedIDs, plan: { source in
                    let leaf = try #require(source.recordings.first)
                    return .init(firstStart: start, secondStart: start.addingTimeInterval(15),
                                 recordings: [.cut(folder: leaf.callTrack.deletingLastPathComponent(), offset: 15)]) { first, second in
                        try Data("first".utf8).write(to: first.appendingPathComponent("transcript.md"))
                        try Data("second".utf8).write(to: second.appendingPathComponent("transcript.md"))
                    }
                }, cut: cut
            ) { try register(.init(first: $0.first, second: $0.second)) }
            return .init(first: parts.first, second: parts.second)
        }
    }

    private func storage(in root: URL, journal: URL? = nil, operation: CallsStorageGuard = .serial(), disk: CallsDisk = .system,
                         writeJournal: @escaping @Sendable (CallsJournal, URL) throws -> Void = CallsStorage.writeAtomically) -> CallsStorage {
        CallsStorage(folder: root, journal: journal, writeJournal: writeJournal,
                     readPart: { _, _ in throw ScriptFailure.failed }, makeCalls: { calls(in: $0, disk: disk) }, operation: operation)
    }
}

private func unexpectedTransaction(_ request: CallsStorage.SplitRequest,
                                   _ register: (CallsStorage.SplitReplacement) throws -> Void) throws -> CallsStorage.SplitReplacement {
    Issue.record("split preparation was called")
    throw ScriptFailure.failed
}

private func calls(in folder: URL, disk: CallsDisk = .system) -> Calls {
    Calls(folder: folder, timeZone: .gmt, duration: { url in
        try Data(contentsOf: url) == Data("original audio".utf8) ? 30 : 15
    }, transcript: { _ in [] }, disk: disk)
}

private func readTranscript(in folder: URL) throws -> String {
    try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
}

private func makeFolder(_ name: String, in parent: URL) throws -> URL {
    let folder = parent.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    return folder
}

private func makeCall(_ id: String, in root: URL) throws -> URL {
    let call = try makeFolder(id, in: root)
    try Data("original".utf8).write(to: call.appendingPathComponent("transcript.md"))
    try Data("original audio".utf8).write(to: call.appendingPathComponent("call.caf"))
    return call
}

private func cutTrack(_ offset: TimeInterval, _ source: URL, _ first: URL, _ second: URL) throws {
    guard FileManager.default.fileExists(atPath: source.path) else { return }
    #expect(offset == 15)
    #expect(try String(contentsOf: source, encoding: .utf8) == "original audio")
    try Data("first audio".utf8).write(to: first)
    try Data("second audio".utf8).write(to: second)
}
