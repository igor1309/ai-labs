import Calls
import CallsStorage
import Darwin
import Foundation
import Testing

func withStorageFolder(isolation: isolated (any Actor)? = #isolation, _ body: (URL) async throws -> Void) async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("calls-storage-test-\(UUID())")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    let outcome: Result<Void, any Error>
    do { outcome = .success(try await body(folder)) } catch { outcome = .failure(error) }
    do { try FileManager.default.removeItem(at: folder) }
    catch { Issue.record(error) }
    try outcome.get()
}

/// Stands in for the Trash: tests never move anything into the user's own.
let removeForTrash: @Sendable (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) }

/// Storage over the real disk; calls have no audio duration or transcript lines.
func makeStorage(folder: URL, journal: URL? = nil,
                 writeJournal: @escaping @Sendable (CallsJournal, URL) throws -> Void = CallsStorage.writeAtomically) -> CallsStorage {
    var disk = CallsDisk.system
    disk.trash = removeForTrash
    return CallsStorage(folder: folder, journal: journal, writeJournal: writeJournal,
                        makeCalls: { [disk] in Calls(folder: $0, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: disk) })
}

enum ScriptFailure: Error, Equatable { case failed }

func sameDirectory(_ left: URL, _ right: URL) async throws -> Bool {
    var lhs = stat(), rhs = stat()
    guard stat(left.path, &lhs) == 0, stat(right.path, &rhs) == 0 else { throw CocoaError(.fileReadUnknown) }
    return lhs.st_dev == rhs.st_dev && lhs.st_ino == rhs.st_ino
}
