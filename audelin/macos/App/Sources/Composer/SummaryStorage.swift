import Calls
import Recordings
import Foundation
import Preferences
import SummaryFiles
import Synchronization
import TrackFile

/// One transaction boundary for call mutations and note publication.
final class SummaryStorage: SummaryFiles.Locations, Sendable {
    struct Journal: Codable, Sendable {
        var moves: [String: Calls.Move] = [:]
    }
    private struct State {
        var recordingFolder: URL
        var journal = Journal()
    }
    private let state: Mutex<State>
    private let journal: URL?
    private let writeJournal: @Sendable (Journal, URL) throws -> Void
    private let makeCalls: @Sendable (URL) -> Calls
    private let queue = DispatchQueue(label: "audelin.call-storage")

    convenience init(folder: URL, timeZone: TimeZone, journal: URL? = nil) {
        self.init(folder: folder, timeZone: timeZone, journal: journal, writeJournal: { record, journal in
            try FileManager.default.createDirectory(at: journal.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(record).write(to: journal, options: .atomic)
        })
    }
    convenience init(folder: URL, timeZone: TimeZone, journal: URL?,
                     writeJournal: @escaping @Sendable (Journal, URL) throws -> Void) {
        self.init(folder: folder, journal: journal, writeJournal: writeJournal,
                  makeCalls: { Calls(folder: $0, timeZone: timeZone, duration: TrackFile.duration(at:)) })
    }
    init(folder: URL, journal: URL?, writeJournal: @escaping @Sendable (Journal, URL) throws -> Void,
         makeCalls: @escaping @Sendable (URL) -> Calls) {
        state = Mutex(State(recordingFolder: Self.directory(folder)))
        self.journal = journal; self.writeJournal = writeJournal; self.makeCalls = makeCalls
    }

    func restore() async throws {
        try await perform { [self] in
            guard let journal else { return }
            do {
                let saved = try JSONDecoder().decode(Journal.self, from: Data(contentsOf: journal))
                guard saved.moves.allSatisfy({ id, move in
                    let source = move.source.resolvingSymlinksInPath().standardizedFileURL.path
                    let target = move.target.resolvingSymlinksInPath().standardizedFileURL.path
                    return !target.hasPrefix(source + "/") && !source.hasPrefix(target + "/") &&
                    move.source.isFileURL && move.target.isFileURL && move.temporary.isFileURL &&
                    Calls.id(in: move.source.lastPathComponent, timeZone: .gmt) == id &&
                    Calls.id(in: move.target.lastPathComponent, timeZone: .gmt) == id &&
                    !Self.sameRoot(move.source, move.target) && move.temporary != move.target &&
                    Self.sameRoot(move.temporary.deletingLastPathComponent(), move.target.deletingLastPathComponent()) &&
                    move.temporary.lastPathComponent.hasPrefix(".audelin-move-")
                }) else { throw CocoaError(.fileReadCorruptFile) }
                state.withLock { state in
                    state.journal = saved
                    recover(&state)
                }
            } catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
        }
    }
    private func save(_ record: Journal) throws {
        if let journal { try writeJournal(record, journal) }
    }
    private func record(_ move: Calls.Move, id: String, state: inout State) throws {
        var next = state.journal
        next.moves[id] = move
        try save(next)
        state.journal = next
    }
    private static func directory(_ url: URL) -> URL { URL(fileURLWithPath: url.standardizedFileURL.path, isDirectory: true) }
    private static func sameRoot(_ left: URL, _ right: URL) -> Bool {
        left.resolvingSymlinksInPath().standardizedFileURL.path == right.resolvingSymlinksInPath().standardizedFileURL.path
    }

    /// Retained volumes need not be mounted to reserve the calls they own.
    func occupiedCallNames() throws -> [String] {
        state.withLock { Array($0.journal.moves.keys) }
    }
    private func recover(_ state: inout State, id: String? = nil) {
        let ids = id.map { [$0] } ?? Array(state.journal.moves.keys)
        for id in ids {
            guard let move = state.journal.moves[id] else { continue }
            // Failed cleanup keeps its recorded owner available and is retried on access.
            _ = try? makeCalls(move.source.deletingLastPathComponent()).recover(move) {
                try record($0, id: id, state: &state)
            }
        }
    }
    private func location(id: String, state: State) throws -> URL {
        let root = state.journal.moves[id]?.owner.deletingLastPathComponent() ?? state.recordingFolder
        return try makeCalls(root).location(id: id)
    }
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) throws -> Value {
        try state.withLock { state in
            recover(&state, id: call)
            return try operation(location(id: call, state: state))
        }
    }
    func perform<Value: Sendable>(_ work: @escaping @Sendable () throws -> Value) async throws -> Value {
        try await withCheckedThrowingContinuation { done in queue.async { done.resume(with: Result(catching: work)) } }
    }
    private func list(_ state: State) throws -> [Calls.Call] {
        var result = try makeCalls(state.recordingFolder).list().filter {
            guard let move = state.journal.moves[$0.id] else { return true }
            return Self.sameRoot(move.owner.deletingLastPathComponent(), state.recordingFolder)
        }
        let otherRoots = Set(state.journal.moves.values.map {
            Self.directory($0.owner.deletingLastPathComponent().resolvingSymlinksInPath())
        })
            .filter { !Self.sameRoot($0, state.recordingFolder) }
        for root in otherRoots {
            result += try makeCalls(root).list().filter { call in
                state.journal.moves[call.id].map { Self.sameRoot($0.owner.deletingLastPathComponent(), root) } == true
            }
        }
        return result.sorted { $0.id > $1.id }
    }
    func list() async throws -> [Calls.Call] {
        try await perform { [self] in
            try state.withLock { state in recover(&state); return try list(state) }
        }
    }
    func rename(id: String, title: String) async throws {
        try await perform { [self] in
            try withFolder(call: id) { try makeCalls($0.deletingLastPathComponent()).rename(id: id, title: title) }
        }
    }
    func delete(id: String) async throws {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state, id: id)
                if let move = state.journal.moves[id], ![.source, .destination].contains(move.phase) {
                    throw CocoaError(.fileWriteUnknown)
                }
                let folder = try location(id: id, state: state).deletingLastPathComponent()
                try makeCalls(folder).delete(id: id)
                var next = state.journal
                next.moves.removeValue(forKey: id)
                try save(next)
                state.journal = next
            }
        }
    }
    func location(id: String) async throws -> URL { try await perform { [self] in try withFolder(call: id) { $0 } } }
    private func validate(_ destination: URL, state: State) throws {
        guard destination.isFileURL else { throw CocoaError(.fileWriteInvalidFileName) }
        let target = destination.resolvingSymlinksInPath().standardizedFileURL.path
        for call in try list(state) {
            let path = try location(id: call.id, state: state).resolvingSymlinksInPath().standardizedFileURL.path
            guard target != path, !target.hasPrefix(path + "/") else { throw CocoaError(.fileWriteInvalidFileName) }
        }
        _ = try makeCalls(destination).count()
    }
    func prepareMove(to destination: URL) async throws -> [MoveCall] {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state)
                try validate(destination, state: state)
                return try list(state).filter {
                    try !Self.sameRoot(location(id: $0.id, state: state).deletingLastPathComponent(), destination)
                }.map { call in
                    let root = try location(id: call.id, state: state).deletingLastPathComponent()
                    return MoveCall(id: call.id, title: call.title, bytes: try makeCalls(root).bytes(id: call.id))
                }
            }
        }
    }
    func move(id: String, to destination: URL) async throws -> Int64 {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state, id: id)
                try validate(destination, state: state)
                if let move = state.journal.moves[id], ![.source, .destination].contains(move.phase) {
                    throw CocoaError(.fileWriteUnknown)
                }
                let source = try location(id: id, state: state)
                if Self.sameRoot(source.deletingLastPathComponent(), destination) {
                    return try makeCalls(destination).bytes(id: id)
                }
                return try makeCalls(source.deletingLastPathComponent()).move(id: id, to: destination) {
                    try record($0, id: id, state: &state)
                }
            }
        }
    }
    func commitFolder(_ destination: URL, commit: @escaping @Sendable () throws -> Void) async throws {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state)
                try validate(destination, state: state)
                guard try list(state).allSatisfy({
                    try Self.sameRoot(location(id: $0.id, state: state).deletingLastPathComponent(), destination)
                }), state.journal.moves.values.allSatisfy({ [.source, .destination].contains($0.phase) }) else {
                    throw CocoaError(.fileWriteUnknown)
                }
                try save(state.journal)
                try commit()
                state.recordingFolder = Self.directory(destination)
                // The preference commit is the result. Keeping redundant recovery
                // records is safe when their final cleanup cannot be persisted.
                if (try? save(Journal())) != nil { state.journal = Journal() }
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
