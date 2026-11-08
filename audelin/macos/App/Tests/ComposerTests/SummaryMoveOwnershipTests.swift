import BlockingTestWork
import CallFolder
@testable import Calls
import Foundation
import SummaryFiles
import Synchronization
import Testing
@testable import Composer

@Suite struct SummaryMoveOwnershipTests {
    @Test func offlineDestinationDoesNotBlockRecordingOrAnUnmovedSummary() async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let journal = root.appendingPathComponent("moves.json")
            let moved = "1970.01.01-0000", remaining = "1970.01.01-0001"
            try await offPool {
                for folder in [source.appendingPathComponent(moved), source.appendingPathComponent(remaining), target] {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                }
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            _ = try await storage.move(id: moved, to: target)
            try await offPool { try FileManager.default.moveItem(at: target, to: root.appendingPathComponent("offline")) }
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: remaining, to: target) }
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            #expect(try await offPool { try recovered.occupiedCallNames() } == [moved])
            #expect(try await sameDirectory(recovered.location(id: remaining).deletingLastPathComponent(), source))
            let made = try await offPool {
                try CallFolder(callsURL: source, now: { Date(timeIntervalSince1970: 0) }, timeZone: .gmt,
                               occupiedNames: { try recovered.occupiedCallNames() }).make()
            }
            #expect(made.url.lastPathComponent == moved + "-2")
            #expect(made.url.deletingLastPathComponent().path == source.path)
            let files = Files(locations: recovered, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let job = Record(job: "job", call: remaining, input: "input", snapshot: Data(), phase: "pending")
            _ = try await files.claim(job); _ = try await files.start(job)
            try await files.publish(job, notes: "source is available")
            #expect(try await offPool { try String(contentsOf: source.appendingPathComponent(remaining + "/summary.md"), encoding: .utf8) }.hasSuffix("source is available"))
        }
    }

    @Test(arguments: [Calls.Move.Phase.copying, .publishing, .removingSource, .restoringSource, .removingCopy])
    func offlineCleanupStaysPendingAndDoesNotBlockTheConfiguredFolder(phase: Calls.Move.Phase) async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let original = source.appendingPathComponent(id), copied = target.appendingPathComponent(id)
            let temporary = target.appendingPathComponent(".audelin-move-test"), journal = root.appendingPathComponent("moves.json")
            let destinationOwns = phase == .removingSource || phase == .restoringSource
            let configured = destinationOwns ? target : source, cleanup = destinationOwns ? source : target
            let offline = root.appendingPathComponent("offline")
            try await offPool {
                for folder in [original, copied, temporary] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
                if phase != .copying { try FileManager.default.removeItem(at: temporary) }
                let move = Calls.Move(source: original, target: copied, temporary: temporary, phase: phase)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
                try FileManager.default.moveItem(at: cleanup, to: offline)
            }
            let storage = SummaryStorage(folder: configured, timeZone: .gmt, journal: journal)
            try await storage.restore()
            #expect(try await sameDirectory(storage.location(id: id).deletingLastPathComponent(), configured))
            let saved = try await offPool { try JSONDecoder().decode(SummaryStorage.Journal.self, from: Data(contentsOf: journal)) }
            #expect(saved.moves[id]?.phase == phase)
            let made = try await offPool {
                try CallFolder(callsURL: configured, now: { Date(timeIntervalSince1970: 0) }, timeZone: .gmt,
                               occupiedNames: { try storage.occupiedCallNames() }).make()
            }
            #expect(made.url.lastPathComponent == id + "-2")
            #expect(try await sameDirectory(made.url.deletingLastPathComponent(), configured))
            try await offPool { try FileManager.default.moveItem(at: offline, to: cleanup) }
            _ = try await storage.location(id: id)
            let cleaned = try await offPool { try JSONDecoder().decode(SummaryStorage.Journal.self, from: Data(contentsOf: journal)) }
            #expect(cleaned.moves[id]?.phase == (phase == .removingSource ? .destination : .source))
        }
    }

    @Test(arguments: [Calls.Move.Phase.removingSource, .removingCopy])
    func offlineOwnerKeepsTheOtherCopyUntilTheOwnerReturns(phase: Calls.Move.Phase) async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let original = source.appendingPathComponent(id), copied = target.appendingPathComponent(id)
            let journal = root.appendingPathComponent("moves.json"), offline = root.appendingPathComponent("offline")
            let owner = phase == .removingSource ? target : source, other = phase == .removingSource ? original : copied
            try await offPool {
                for folder in [original, copied] {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    try Data("whole".utf8).write(to: folder.appendingPathComponent("transcript.md"))
                }
                let move = Calls.Move(source: original, target: copied, temporary: target.appendingPathComponent(".audelin-move-test"), phase: phase)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
                try FileManager.default.moveItem(at: owner, to: offline)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await storage.restore()
            #expect(try await offPool { try String(contentsOf: other.appendingPathComponent("transcript.md"), encoding: .utf8) } == "whole")
            try await offPool { try FileManager.default.moveItem(at: offline, to: owner) }
            _ = try await storage.location(id: id)
            #expect(await offPool { !FileManager.default.fileExists(atPath: other.path) })
        }
    }

    @Test func finderRenameOfTheVerifiedOwnerSurvivesRestorationRecovery() async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let original = source.appendingPathComponent(id), copied = target.appendingPathComponent(id)
            let renamed = target.appendingPathComponent(id + " renamed"), journal = root.appendingPathComponent("moves.json")
            try await offPool {
                for folder in [original, copied] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
                try Data("whole".utf8).write(to: copied.appendingPathComponent("transcript.md"))
                let move = Calls.Move(source: original, target: copied, temporary: target.appendingPathComponent(".audelin-move-test"), phase: .restoringSource)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
                try FileManager.default.moveItem(at: copied, to: renamed)
            }
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await storage.restore()
            #expect(try await sameDirectory(storage.location(id: id), renamed))
            #expect(try await storage.list().map(\.title) == ["renamed"])
            #expect(try await offPool { try String(contentsOf: renamed.appendingPathComponent("transcript.md"), encoding: .utf8) } == "whole")
            #expect(await offPool { !FileManager.default.fileExists(atPath: original.path) })
        }
    }

    @Test func nestedRecoveryRecordIsRejectedBeforeAnyDeletion() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", original = root.appendingPathComponent("source/" + id)
            let nested = original.appendingPathComponent("nested/" + id), journal = root.appendingPathComponent("moves.json")
            try await offPool {
                try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
                try Data("whole".utf8).write(to: nested.appendingPathComponent("transcript.md"))
                let move = Calls.Move(source: original, target: nested,
                                      temporary: nested.deletingLastPathComponent().appendingPathComponent(".audelin-move-test"), phase: .removingSource)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
            }
            let storage = SummaryStorage(folder: original.deletingLastPathComponent(), timeZone: .gmt, journal: journal)
            await #expect(throws: (any Error).self) { try await storage.restore() }
            #expect(try await offPool { try String(contentsOf: nested.appendingPathComponent("transcript.md"), encoding: .utf8) } == "whole")
        }
    }

    @Test(arguments: [1, 2])
    func duplicateIDAtDestinationDoesNotChangeOwnershipOrPublication(copies: Int) async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let id = "1970.01.01-0000", moved = "1970.01.01-0001"
            try await offPool {
                for folder in [source.appendingPathComponent(id), source.appendingPathComponent(moved), target] {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                }
                for number in 1...copies {
                    let foreign = target.appendingPathComponent(id + " unrelated\(number)")
                    try FileManager.default.createDirectory(at: foreign, withIntermediateDirectories: false)
                    try Data("foreign".utf8).write(to: foreign.appendingPathComponent("summary.md"))
                }
            }
            let journal = root.appendingPathComponent("moves.json")
            let storage = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            _ = try await storage.move(id: moved, to: target)
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: target) }
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            #expect(try await recovered.list().map(\.id) == [moved, id])
            let files = Files(locations: recovered, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let job = Record(job: "job", call: id, input: "input", snapshot: Data(), phase: "pending")
            _ = try await files.claim(job); _ = try await files.start(job)
            try await files.publish(job, notes: "unmoved call")
            #expect(try await offPool { try String(contentsOf: source.appendingPathComponent(id + "/summary.md"), encoding: .utf8) }.hasSuffix("unmoved call"))
            try await recovered.rename(id: id, title: "owned")
            #expect(try await recovered.location(id: id).lastPathComponent == id + " owned")
            for number in 1...copies {
                #expect(try await offPool { try String(contentsOf: target.appendingPathComponent(id + " unrelated\(number)/summary.md"), encoding: .utf8) } == "foreign")
            }
        }
    }

    @Test(arguments: [Calls.Move.Phase.copying, .publishing, .removingSource, .restoringSource, .removingCopy])
    func recoveryUsesTheRecordedPhaseBeforeLookup(phase: Calls.Move.Phase) async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let original = source.appendingPathComponent(id), copied = target.appendingPathComponent(id)
            let temporary = target.appendingPathComponent(".audelin-move-test"), journal = root.appendingPathComponent("moves.json")
            try await offPool {
                for folder in [original, copied, temporary] {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                }
                try Data("whole".utf8).write(to: copied.appendingPathComponent("transcript.md"))
                try Data("fresh".utf8).write(to: copied.appendingPathComponent("summary.md"))
                try Data("stale".utf8).write(to: original.appendingPathComponent("summary.md"))
                if phase != .restoringSource { try Data("whole".utf8).write(to: original.appendingPathComponent("transcript.md")) }
                if phase != .copying { try FileManager.default.removeItem(at: temporary) }
                if phase == .copying { try FileManager.default.removeItem(at: copied) }
                let move = Calls.Move(source: original, target: copied, temporary: temporary, phase: phase)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
            }
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            let expected = phase == .removingSource ? copied : original
            #expect(try await sameDirectory(recovered.location(id: id), expected))
            #expect(try await recovered.list().map(\.id) == [id])
            #expect(try await offPool { try String(contentsOf: expected.appendingPathComponent("transcript.md"), encoding: .utf8) } == "whole")
            let expectedNotes = phase == .restoringSource || phase == .removingSource ? "fresh" : "stale"
            #expect(try await offPool { try String(contentsOf: expected.appendingPathComponent("summary.md"), encoding: .utf8) } == expectedNotes)
            let saved = try await offPool { try JSONDecoder().decode(SummaryStorage.Journal.self, from: Data(contentsOf: journal)) }
            #expect(saved.moves[id]?.phase == (phase == .removingSource ? .destination : .source))
            #expect(await offPool { !FileManager.default.fileExists(atPath: temporary.path) })
            #expect(await offPool { !FileManager.default.fileExists(atPath: (phase == .removingSource ? original : copied).path) })
        }
    }

    @Test(arguments: ["copy", "verification"])
    func failedRestorationPublishesToTheVerifiedOwnerAndRetryRestoresThatPublication(step: String) async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let journal = root.appendingPathComponent("moves.json"), fail = Mutex(true)
            try await offPool {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                try Data("whole".utf8).write(to: source.appendingPathComponent(id + "/transcript.md"))
                try FileManager.default.copyItem(at: source.appendingPathComponent(id), to: target.appendingPathComponent(id))
                try FileManager.default.removeItem(at: source.appendingPathComponent(id + "/transcript.md"))
                let move = Calls.Move(source: source.appendingPathComponent(id), target: target.appendingPathComponent(id),
                                      temporary: target.appendingPathComponent(".audelin-move-test"), phase: .restoringSource)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
            }
            let storage = SummaryStorage(folder: source, journal: journal,
                writeJournal: { try JSONEncoder().encode($0).write(to: $1, options: .atomic) },
                makeCalls: { folder in
                    Calls(folder: folder, timeZone: .gmt,
                        children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                        values: { url in
                            if step == "verification", fail.withLock({ $0 }),
                               url.lastPathComponent == "transcript.md",
                               url.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent == "source" {
                                throw POSIXError(.EIO)
                            }
                            return try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey])
                        },
                        duration: { _ in 0 }, copy: { from, to in
                            if step == "copy", fail.withLock({ $0 }), to.pathComponents.contains("source") { throw CocoaError(.fileWriteNoPermission) }
                            try FileManager.default.copyItem(at: from, to: to)
                        }, rename: { try FileManager.default.moveItem(at: $0, to: $1) },
                        remove: { try FileManager.default.removeItem(at: $0) })
                })
            try await storage.restore()
            #expect(try await sameDirectory(storage.location(id: id).deletingLastPathComponent(), target))
            #expect(try await storage.list().map(\.id) == [id])
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let job = Record(job: "job", call: id, input: "input", snapshot: Data(), phase: "pending")
            try await #require(throws: Never.self) { _ = try await files.claim(job) }
            try await #require(throws: Never.self) { _ = try await files.start(job) }
            try await #require(throws: Never.self) { try await files.publish(job, notes: "published to owner") }
            #expect(try await offPool { try String(contentsOf: target.appendingPathComponent(id + "/transcript.md"), encoding: .utf8) } == "whole")
            let pending = try await offPool { try JSONDecoder().decode(SummaryStorage.Journal.self, from: Data(contentsOf: journal)) }
            #expect(pending.moves[id]?.phase == .restoringSource)
            fail.withLock { $0 = false }
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await #require(throws: Never.self) { try await recovered.restore() }
            #expect(try await sameDirectory(recovered.location(id: id).deletingLastPathComponent(), source))
            #expect(try await offPool { try String(contentsOf: source.appendingPathComponent(id + "/summary.md"), encoding: .utf8) }.hasSuffix("published to owner"))
            try await #require(throws: Never.self) { _ = try await recovered.move(id: id, to: target) }
            try await #require(throws: Never.self) { try await recovered.commitFolder(target, commit: {}) }
            #expect(try await offPool { try String(contentsOf: target.appendingPathComponent(id + "/summary.md"), encoding: .utf8) }.hasSuffix("published to owner"))
        }
    }

    @Test func interruptedTemporaryCleanupNeverDeletesTheOtherCallsCopy() async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let original = source.appendingPathComponent(id), other = target.appendingPathComponent(id)
            let temporary = target.appendingPathComponent(".audelin-move-test"), journal = root.appendingPathComponent("moves.json")
            try await offPool {
                for folder in [original, other, temporary] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
                try Data("unrelated".utf8).write(to: other.appendingPathComponent("transcript.md"))
                let move = Calls.Move(source: original, target: other, temporary: temporary, phase: .publishing)
                try JSONEncoder().encode(SummaryStorage.Journal(moves: [id: move])).write(to: journal)
            }
            let failing = SummaryStorage(folder: source, timeZone: .gmt, journal: journal, writeJournal: { record, url in
                if record.moves[id]?.phase == .source { throw CocoaError(.fileWriteNoPermission) }
                try JSONEncoder().encode(record).write(to: url, options: .atomic)
            })
            try await failing.restore()
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            #expect(try await sameDirectory(recovered.location(id: id), original))
            #expect(try await offPool { try String(contentsOf: other.appendingPathComponent("transcript.md"), encoding: .utf8) } == "unrelated")
            #expect(await offPool { !FileManager.default.fileExists(atPath: temporary.path) })
        }
    }

    @Test func failedCopyCleanupKeepsTheSourceUsableAndRetryCleansBeforeMoving() async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let fail = Mutex(true), journal = root.appendingPathComponent("moves.json")
            try await offPool {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                try Data("whole".utf8).write(to: source.appendingPathComponent(id + "/transcript.md"))
            }
            let storage = SummaryStorage(folder: source, journal: journal,
                writeJournal: { try JSONEncoder().encode($0).write(to: $1, options: .atomic) },
                makeCalls: { folder in
                    Calls(folder: folder, timeZone: .gmt,
                        children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                        values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                        duration: { _ in 0 }, copy: { from, to in
                            try FileManager.default.copyItem(at: from, to: to)
                            if fail.withLock({ $0 }) { throw CocoaError(.fileWriteOutOfSpace) }
                        }, rename: { try FileManager.default.moveItem(at: $0, to: $1) }, remove: {
                            if fail.withLock({ $0 }) { throw CocoaError(.fileWriteNoPermission) }
                            try FileManager.default.removeItem(at: $0)
                        })
                })
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: target) }
            #expect(try await sameDirectory(storage.location(id: id).deletingLastPathComponent(), source))
            #expect(try await storage.list().map(\.id) == [id])
            fail.withLock { $0 = false }
            #expect(try await storage.move(id: id, to: target) == 5)
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: target.path) } == [id])
            #expect(try await sameDirectory(storage.location(id: id).deletingLastPathComponent(), target))
        }
    }

    @Test(arguments: ["rollbackCleanup", "retiredCleanup"])
    func atomicRetirementKeepsOneWholeOwnerWhenCleanupFails(step: String) async throws {
        try await withComposeFolder { temporaryRoot in
            let root = await offPool { temporaryRoot.resolvingSymlinksInPath() }
            let id = "1970.01.01-0000", source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
            let original = source.appendingPathComponent(id), copied = target.appendingPathComponent(id)
            let journal = root.appendingPathComponent("moves.json"), fail = Mutex(true), restorations = Mutex(0)
            try await offPool {
                try FileManager.default.createDirectory(at: original, withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                try Data("whole".utf8).write(to: original.appendingPathComponent("transcript.md"))
                try Data([1, 2, 3]).write(to: original.appendingPathComponent("audio"))
            }
            let storage = SummaryStorage(folder: source, journal: journal,
                writeJournal: { try JSONEncoder().encode($0).write(to: $1, options: .atomic) },
                makeCalls: { folder in
                    Calls(folder: folder, timeZone: .gmt,
                        children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                        values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                        duration: { _ in 0 }, copy: { from, to in
                            if to.pathComponents.contains("source") {
                                restorations.withLock { $0 += 1 }
                                throw POSIXError(.EIO)
                            }
                            try FileManager.default.copyItem(at: from, to: to)
                        }, rename: { from, to in
                            if step == "rollbackCleanup", from.lastPathComponent == id,
                               from.deletingLastPathComponent().lastPathComponent == "source", fail.withLock({ $0 }) { throw POSIXError(.EIO) }
                            guard renamex_np(from.path, to.path, UInt32(RENAME_EXCL)) == 0 else { throw POSIXError(.EIO) }
                        }, remove: { url in
                            if fail.withLock({ $0 }) {
                                if step == "rollbackCleanup", url.lastPathComponent == id,
                                   url.deletingLastPathComponent().lastPathComponent == "target" { throw POSIXError(.EIO) }
                                if step == "retiredCleanup", url.lastPathComponent.hasSuffix("-source") {
                                    let audio = url.appendingPathComponent("audio")
                                    if FileManager.default.fileExists(atPath: audio.path) { try FileManager.default.removeItem(at: audio) }
                                    throw POSIXError(.EIO)
                                }
                            }
                            try FileManager.default.removeItem(at: url)
                        })
                })
            if step == "rollbackCleanup" {
                await #expect(throws: (any Error).self) { _ = try await storage.move(id: id, to: target) }
            } else {
                #expect(try await storage.move(id: id, to: target) == 8)
            }
            let owner = step == "rollbackCleanup" ? original : copied
            #expect(try await sameDirectory(storage.location(id: id), owner))
            #expect(try await storage.list().map(\.id) == [id])
            #expect(try await offPool { try Data(contentsOf: owner.appendingPathComponent("audio")) } == Data([1, 2, 3]))
            #expect(try await offPool { try String(contentsOf: owner.appendingPathComponent("transcript.md"), encoding: .utf8) } == "whole")
            let saved = try await offPool { try JSONDecoder().decode(SummaryStorage.Journal.self, from: Data(contentsOf: journal)) }
            #expect(saved.moves[id]?.phase == (step == "rollbackCleanup" ? .removingCopy : .removingSource))
            #expect(restorations.withLock { $0 } == 0)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let job = Record(job: "job", call: id, input: "input", snapshot: Data(), phase: "pending")
            _ = try await files.claim(job); _ = try await files.start(job)
            try await files.publish(job, notes: "published to owner")
            fail.withLock { $0 = false }
            let recovered = SummaryStorage(folder: source, timeZone: .gmt, journal: journal)
            try await recovered.restore()
            #expect(try await sameDirectory(recovered.location(id: id), owner))
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: source.path) } == (step == "rollbackCleanup" ? [id] : []))
            if step == "rollbackCleanup" { #expect(try await recovered.move(id: id, to: target) > 8) }
            try await recovered.commitFolder(target, commit: {})
            #expect(try await offPool { try Data(contentsOf: copied.appendingPathComponent("audio")) } == Data([1, 2, 3]))
            #expect(try await offPool { try String(contentsOf: copied.appendingPathComponent("summary.md"), encoding: .utf8) }.hasSuffix("published to owner"))
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: target.path) } == [id])
        }
    }
}
