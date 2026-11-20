import CallsStorage
import Foundation
import Synchronization
import Testing
@testable import Calls

/// A transcript change interrupted in a folder the journal says owns a call is put back
/// when storage restores, before that call is listed or read.
@Suite(.timeLimit(.minutes(1))) struct CallsStorageTranscriptRecoveryTests {
    private let id = "1970.01.01-0000"
    private let old = Data("old transcript".utf8), new = Data("new transcript".utf8)

    enum Owner: CaseIterable { case moved, retained }

    @Test(arguments: Owner.allCases)
    func aTranscriptChangeInterruptedInAnOwningFolderIsPutBack(owner: Owner) async throws {
        try await withStorageFolder { root in
            let calls = root.appendingPathComponent("calls"), other = root.appendingPathComponent("other")
            let journal = root.appendingPathComponent("folders.json")
            try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: other, withIntermediateDirectories: true)
            let call = (owner == .moved ? calls : other).appendingPathComponent(id, isDirectory: true)
            try FileManager.default.createDirectory(at: call, withIntermediateDirectories: false)
            try old.write(to: call.appendingPathComponent("transcript.md"))
            if owner == .retained { try CallsStorage.writeAtomically(CallsJournal(owners: [id: other]), journal) }

            let crash = Crash()
            let first = storage(calls, journal: journal, disk: crash.disk())
            try await first.restore()
            if owner == .moved { _ = try await first.move(id: id, to: other) }
            crash.arm()
            await #expect(throws: (any Error).self) {
                try await first.publishTranscript(id: id) { try self.new.write(to: $0) }
            }
            #expect(crash.struck)
            let moved = other.appendingPathComponent(id, isDirectory: true)
            #expect(!FileManager.default.fileExists(atPath: moved.appendingPathComponent("transcript.md").path))

            let restarted = storage(calls, journal: journal, disk: .system)
            try await restarted.restore()

            #expect(try await restarted.list().map(\.id) == [id])
            #expect(try await restarted.savedTranscript(id: id) == old)
            #expect(try await sameDirectory(restarted.location(id: id), moved))
            #expect(try FileManager.default.contentsOfDirectory(atPath: other.path).sorted() == [id])
            #expect(try FileManager.default.contentsOfDirectory(atPath: moved.path).sorted() == ["transcript.md"])
        }
    }

    private func storage(_ folder: URL, journal: URL, disk: CallsDisk) -> CallsStorage {
        var disk = disk
        disk.trash = removeForTrash
        return CallsStorage(folder: folder, journal: journal, readPart: { _, _ in throw CocoaError(.fileReadUnknown) },
                            makeCalls: { [disk] in Calls(folder: $0, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: disk) })
    }
}

/// Once armed, the first rename that takes a current transcript into a change's record
/// happens and then the disk is gone, as if the app quit there: nothing after it runs,
/// rollback included, until storage starts again over the real disk.
private final class Crash: Sendable {
    private struct State { var armed = false; var struck = false }
    private let state = Mutex(State())
    var struck: Bool { state.withLock { $0.struck } }
    func arm() { state.withLock { $0.armed = true } }
    private func check() throws { if state.withLock({ $0.struck }) { throw POSIXError(.EIO) } }
    func disk() -> CallsDisk {
        var disk = CallsDisk.system
        disk.children = { try self.check(); return try CallsDisk.system.children($0) }
        disk.values = { try self.check(); return try CallsDisk.system.values($0) }
        disk.read = { try self.check(); return try CallsDisk.system.read($0) }
        disk.makeFolder = { try self.check(); try CallsDisk.system.makeFolder($0) }
        disk.copy = { try self.check(); try CallsDisk.system.copy($0, $1) }
        disk.remove = { try self.check(); try CallsDisk.system.remove($0) }
        disk.rename = { source, target in
            try self.check()
            try CallsDisk.system.rename(source, target)
            let strike = self.state.withLock { state in
                guard state.armed, source.lastPathComponent == "transcript.md",
                      target.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent == "transcripts" else { return false }
                state.struck = true
                return true
            }
            if strike { throw POSIXError(.EIO) }
        }
        return disk
    }
}
