import Calls
import Foundation
import Recordings
import SummaryFiles
import Synchronization

/// One transaction boundary for call mutations and note publication. It keeps
/// the calls journal, recovers moves a crash interrupted, runs every operation
/// one at a time, and refuses to delete, move or commit while a move is half finished.
public final class CallsStorage: SummaryFiles.Locations, Sendable {
    private struct State {
        var recordingFolder: URL
        var journal = CallsJournal()
    }
    private let state: Mutex<State>
    private let journal: URL?
    private let writeJournal: @Sendable (CallsJournal, URL) throws -> Void
    private let makeCalls: @Sendable (URL) -> Calls
    // Every operation, including summary writes through withFolder, takes this turn,
    // so one waiting for a long folder move suspends instead of blocking a thread.
    private let turn = Turn()
    private let published = Mutex<(state: CallsTransaction, watchers: [UUID: AsyncStream<CallsTransaction>.Continuation])>((.idle, [:]))

    /// `journal` is where the journal is kept; nil keeps it in memory only.
    /// `makeCalls` opens the calls of one folder.
    public init(folder: URL, journal: URL?, writeJournal: @escaping @Sendable (CallsJournal, URL) throws -> Void = CallsStorage.writeAtomically,
                makeCalls: @escaping @Sendable (URL) -> Calls) {
        state = Mutex(State(recordingFolder: directory(folder)))
        self.journal = journal; self.writeJournal = writeJournal; self.makeCalls = makeCalls
    }

    /// Whether a move or folder commit is running: the current value on subscribe, then each change.
    public func transactions() -> AsyncStream<CallsTransaction> {
        let (stream, continuation) = AsyncStream<CallsTransaction>.makeStream()
        let id = UUID()
        published.withLock {
            continuation.yield($0.state)
            $0.watchers[id] = continuation
        }
        continuation.onTermination = { [weak self] _ in self?.published.withLock { _ = $0.watchers.removeValue(forKey: id) } }
        return stream
    }
    private func publish(_ state: CallsTransaction) {
        published.withLock {
            $0.state = state
            for watcher in $0.watchers.values { watcher.yield(state) }
        }
    }
    /// Runs a move or folder commit holding the turn, published as running until it ends.
    private func transaction<Value: Sendable>(_ work: () throws -> Value) async throws -> Value {
        try await perform {
            publish(.running)
            defer { publish(.idle) }
            return try work()
        }
    }

    public func restore() async throws {
        try await perform { [self] in
            guard let journal else { return }
            let data: Data
            do { data = try Data(contentsOf: journal) }
            catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
            let (saved, migrated) = try CallsJournal.read(data) { [makeCalls] root in try makeCalls(root).list().map(\.id) }
            if migrated { try save(saved) }
            state.withLock { state in
                state.journal = saved
                recover(&state)
            }
        }
    }
    private func save(_ record: CallsJournal) throws {
        if let journal { try writeJournal(record, journal) }
    }
    private func record(_ move: Calls.Move, id: String, state: inout State) throws {
        var next = state.journal
        next.moves[id] = move
        next.owners.removeValue(forKey: id)
        try save(next)
        state.journal = next
    }
    public static let writeAtomically: @Sendable (CallsJournal, URL) throws -> Void = { record, journal in
        try FileManager.default.createDirectory(at: journal.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(record).write(to: journal, options: .atomic)
    }

    /// Retained volumes need not be mounted to reserve the calls they own.
    public func occupiedCallNames() throws -> [String] {
        state.withLock { Array(Set($0.journal.moves.keys).union($0.journal.owners.keys)) }
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
        let root = ownerRoot(id: id, state: state) ?? state.recordingFolder
        return try makeCalls(root).location(id: id)
    }
    private func ownerRoot(id: String, state: State) -> URL? {
        state.journal.moves[id]?.owner.deletingLastPathComponent() ?? state.journal.owners[id]
    }
    public func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) async throws -> Value {
        try await perform { try folder(call: call, operation) }
    }
    private func folder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) throws -> Value {
        try state.withLock { state in
            recover(&state, id: call)
            return try operation(location(id: call, state: state))
        }
    }
    private func perform<Value: Sendable>(_ work: () throws -> Value) async throws -> Value {
        try await turn.run(work)
    }
    private func list(_ state: State) throws -> [Calls.Call] {
        var result = try makeCalls(state.recordingFolder).list().filter {
            guard let owner = ownerRoot(id: $0.id, state: state) else { return true }
            return sameRoot(owner, state.recordingFolder)
        }
        let otherRoots = Set((Array(state.journal.owners.values) + state.journal.moves.values.map { $0.owner.deletingLastPathComponent() }).map {
            directory($0.resolvingSymlinksInPath())
        })
            .filter { !sameRoot($0, state.recordingFolder) }
        for root in otherRoots {
            result += try makeCalls(root).list().filter { call in
                ownerRoot(id: call.id, state: state).map { sameRoot($0, root) } == true
            }
        }
        return result.sorted { $0.id > $1.id }
    }
    public func list() async throws -> [Calls.Call] {
        try await perform { [self] in
            try state.withLock { state in recover(&state); return try list(state) }
        }
    }
    public func rename(id: String, title: String) async throws {
        try await perform { [self] in
            try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).rename(id: id, title: title) }
        }
    }
    public func delete(id: String) async throws {
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
                next.owners.removeValue(forKey: id)
                try save(next)
                state.journal = next
            }
        }
    }
    public func location(id: String) async throws -> URL { try await perform { [self] in try folder(call: id) { $0 } } }
    /// A call's notes and transcript lines, for search.
    public func text(id: String) async throws -> Calls.Text {
        try await perform { [self] in try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).text(id: id) } }
    }
    private func validate(_ destination: URL, state: State) throws {
        guard destination.isFileURL else { throw CocoaError(.fileWriteInvalidFileName) }
        let target = destination.resolvingSymlinksInPath().standardizedFileURL.path
        for call in try list(state) {
            let path = try location(id: call.id, state: state).resolvingSymlinksInPath().standardizedFileURL.path
            guard target != path, !target.hasPrefix(path + "/") else { throw CocoaError(.fileWriteInvalidFileName) }
        }
        _ = try makeCalls(destination).count()
    }
    public func prepareMove(to destination: URL) async throws -> [MoveCall] {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state)
                try validate(destination, state: state)
                return try list(state).map { call in
                    let root = try location(id: call.id, state: state).deletingLastPathComponent()
                    return MoveCall(id: call.id, title: call.title, bytes: try makeCalls(root).bytes(id: call.id),
                                    inDestination: sameRoot(root, destination))
                }
            }
        }
    }
    public func move(id: String, to destination: URL) async throws -> Int64 {
        try await transaction { [self] in
            try state.withLock { state in
                recover(&state, id: id)
                try validate(destination, state: state)
                if let move = state.journal.moves[id], ![.source, .destination].contains(move.phase) {
                    throw CocoaError(.fileWriteUnknown)
                }
                let source = try location(id: id, state: state)
                if sameRoot(source.deletingLastPathComponent(), destination) {
                    return try makeCalls(destination).bytes(id: id)
                }
                return try makeCalls(source.deletingLastPathComponent()).move(id: id, to: destination) {
                    try record($0, id: id, state: &state)
                }
            }
        }
    }
    public func commitFolder(_ destination: URL, commit: @escaping @Sendable () throws -> Void) async throws {
        try await transaction { [self] in
            try state.withLock { state in
                recover(&state)
                try validate(destination, state: state)
                guard try list(state).allSatisfy({
                    try sameRoot(location(id: $0.id, state: state).deletingLastPathComponent(), destination)
                }), state.journal.moves.values.allSatisfy({ [.source, .destination].contains($0.phase) }) else {
                    throw CocoaError(.fileWriteUnknown)
                }
                try save(state.journal)
                try commit()
                state.recordingFolder = directory(destination)
                // The preference commit is the result. Keeping redundant recovery
                // records is safe when their final cleanup cannot be persisted.
                if (try? save(CallsJournal())) != nil { state.journal = CallsJournal() }
            }
        }
    }
}

public enum CallsTransaction: Equatable, Sendable {
    case idle, running
}
