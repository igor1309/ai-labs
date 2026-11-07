import Calls
import Recordings
import Foundation
import Preferences
import SummaryFiles
import Synchronization
import TrackFile

/// One transaction boundary for call mutations and note publication, including
/// partially moved calls whose new root has not yet reached preferences.
final class SummaryStorage: SummaryFiles.Locations, Sendable {
    private struct State {
        var recordingFolder: URL
        var retainedFolders: [URL] = []
        var roots: [URL] { [recordingFolder] + retainedFolders }

        mutating func retain(_ folder: URL) {
            if !roots.contains(where: { SummaryStorage.sameRoot($0, folder) }) { retainedFolders.append(folder) }
        }
    }
    private let state: Mutex<State>
    private let journal: URL?
    private let writeJournal: @Sendable ([URL], URL) throws -> Void
    private let timeZone: TimeZone
    private let queue = DispatchQueue(label: "audelin.call-storage")
    convenience init(folder: URL, timeZone: TimeZone, journal: URL? = nil) {
        self.init(folder: folder, timeZone: timeZone, journal: journal, writeJournal: { roots, journal in
            try FileManager.default.createDirectory(at: journal.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(roots).write(to: journal, options: .atomic)
        })
    }
    init(folder: URL, timeZone: TimeZone, journal: URL?, writeJournal: @escaping @Sendable ([URL], URL) throws -> Void) {
        state = Mutex(State(recordingFolder: Self.directory(folder)))
        self.timeZone = timeZone; self.journal = journal; self.writeJournal = writeJournal
    }
    func restore() async throws {
        try await perform { [self] in
            guard let journal else { return }
            do {
                let saved = try JSONDecoder().decode([URL].self, from: Data(contentsOf: journal))
                guard !saved.isEmpty, saved.allSatisfy(\.isFileURL) else { throw CocoaError(.fileReadCorruptFile) }
                let roots = saved.map(Self.directory)
                guard Set(roots).count == roots.count else { throw CocoaError(.fileReadCorruptFile) }
                state.withLock { state in
                    // Preferences decide where recording resumes, even if journal finalization failed.
                    for root in roots { state.retain(root) }
                }
            } catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
        }
    }
    private func saveRoots(_ roots: [URL]) throws {
        if let journal {
            try writeJournal(roots, journal)
        }
    }
    private static func directory(_ url: URL) -> URL { URL(fileURLWithPath: url.standardizedFileURL.path, isDirectory: true) }
    private static func sameRoot(_ left: URL, _ right: URL) -> Bool {
        left.resolvingSymlinksInPath().standardizedFileURL.path == right.resolvingSymlinksInPath().standardizedFileURL.path
    }
    /// Entry names, rather than parsed IDs, keep allocation rules in CallFolder.
    func occupiedCallNames() throws -> [String] {
        try state.withLock { state in
            try state.roots.flatMap { try FileManager.default.contentsOfDirectory(atPath: $0.path) }
        }
    }
    private func calls(_ folder: URL) -> Calls { Calls(folder: folder, timeZone: timeZone, duration: TrackFile.duration(at:)) }
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) throws -> Value {
        try state.withLock { try operation(location(id: call, roots: $0.roots)) }
    }
    private func location(id: String, roots: [URL]) throws -> URL {
        var matches: [URL] = []
        var firstFailure: (any Error)?
        for root in roots {
            do { matches.append(try calls(root).location(id: id)) }
            catch { if firstFailure == nil { firstFailure = error } }
        }
        guard !matches.isEmpty else { throw firstFailure ?? CocoaError(.fileNoSuchFile) }
        guard matches.count == 1, let folder = matches.first else { throw AmbiguousCall(id: id) }
        return folder
    }
    private struct AmbiguousCall: LocalizedError {
        let id: String
        var errorDescription: String? { "Несколько папок имеют префикс «\(id)»." }
    }
    func perform<Value: Sendable>(_ work: @escaping @Sendable () throws -> Value) async throws -> Value {
        try await withCheckedThrowingContinuation { done in queue.async { done.resume(with: Result(catching: work)) } }
    }
    func list() async throws -> [Calls.Call] {
        try await perform { [self] in
            try state.withLock { state in try state.roots.flatMap { try calls($0).list() }.sorted { $0.id > $1.id } }
        }
    }
    func rename(id: String, title: String) async throws {
        try await perform { [self] in try withFolder(call: id) { try calls($0.deletingLastPathComponent()).rename(id: id, title: title) } }
    }
    func delete(id: String) async throws {
        try await perform { [self] in try withFolder(call: id) { try calls($0.deletingLastPathComponent()).delete(id: id) } }
    }
    func location(id: String) async throws -> URL { try await perform { [self] in try withFolder(call: id) { $0 } } }
    func prepareMove(to destination: URL) async throws -> [MoveCall] {
        try await perform { [self] in
            try state.withLock { state in
                try state.roots.filter { !Self.sameRoot($0, destination) }.flatMap { root in
                    let disk = calls(root)
                    return try disk.list().map { call in
                        MoveCall(id: call.id, title: call.title, bytes: try disk.bytes(id: call.id))
                    }
                }
            }
        }
    }
    func move(id: String, to destination: URL) async throws -> Int64 {
        let folder = Self.directory(destination)
        return try await perform { [self] in
            try state.withLock { state in
                guard destination.isFileURL else { throw CocoaError(.fileWriteInvalidFileName) }
                // Nesting calls makes deleting the outer call delete another recording.
                let target = folder.resolvingSymlinksInPath().standardizedFileURL.path
                for root in state.roots {
                    let disk = calls(root)
                    for call in try disk.list() {
                        let path = try disk.location(id: call.id).resolvingSymlinksInPath().standardizedFileURL.path
                        guard target != path, !target.hasPrefix(path + "/") else { throw CocoaError(.fileWriteInvalidFileName) }
                    }
                }
                let source = try location(id: id, roots: state.roots)
                if Self.sameRoot(source.deletingLastPathComponent(), folder) {
                    return try calls(folder).bytes(id: id)
                }
                _ = try calls(folder).count()
                guard (try? calls(folder).location(id: id)) == nil else { throw CocoaError(.fileWriteFileExists) }
                let previous = state
                state.retain(folder)
                do { try saveRoots(state.roots) }
                catch { state = previous; throw error }
                do { return try calls(source.deletingLastPathComponent()).move(id: id, to: folder) }
                catch {
                    if (try? calls(folder).location(id: id)) == nil {
                        try saveRoots(previous.roots)
                        state = previous
                    }
                    throw error
                }
            }
        }
    }
    func commitFolder(_ destination: URL, commit: @escaping @Sendable () throws -> Void) async throws {
        let folder = Self.directory(destination)
        try await perform { [self] in
            try state.withLock { state in
                _ = try calls(folder).count()
                // A recording may have appeared after a failed move. Never abandon it.
                for source in state.roots where !Self.sameRoot(source, folder) {
                    guard try calls(source).count().calls == 0 else { throw CocoaError(.fileWriteUnknown) }
                }
                var retained = state
                retained.retain(folder)
                try saveRoots(retained.roots)
                state = retained
                try commit()
                // Retain recovery locations if pruning fails after preferences were stored.
                state = State(recordingFolder: folder, retainedFolders: state.roots.filter { !Self.sameRoot($0, folder) })
                try saveRoots([folder])
                state = State(recordingFolder: folder)
            }
        }
    }
}

struct SummaryCalls: RecordingsCalls {
    let storage: SummaryStorage
    func list() async throws -> [RecordedCall] {
        try await storage.list().map { .init(id: $0.id, title: $0.title, start: $0.start, duration: $0.duration) }
    }
    func rename(id: String, title: String) async throws { try await storage.rename(id: id, title: title) }
    func delete(id: String) async throws { try await storage.delete(id: id) }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { try await storage.prepareMove(to: destination) }
    func move(id: String, to destination: URL) async throws -> Int64 { try await storage.move(id: id, to: destination) }
}
