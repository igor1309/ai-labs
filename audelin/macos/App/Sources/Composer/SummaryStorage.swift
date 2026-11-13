import Calls
import Recordings
import Foundation
import Preferences
import SummaryFiles
import Synchronization
import TrackFile
import TranscriptFormat

/// One transaction boundary for call mutations and note publication.
final class SummaryStorage: SummaryFiles.Locations, Sendable {
    struct Journal: Codable, Sendable {
        var moves: [String: Calls.Move] = [:]
        var retainedRoots: [URL] = []
        var owners: [String: URL] = [:]

        init(moves: [String: Calls.Move] = [:], retainedRoots: [URL] = [], owners: [String: URL] = [:]) {
            self.moves = moves; self.retainedRoots = retainedRoots; self.owners = owners
        }
        private enum CodingKeys: CodingKey { case moves, retainedRoots, owners }
        init(from decoder: any Decoder) throws {
            let saved = try decoder.container(keyedBy: CodingKeys.self)
            moves = try saved.decode([String: Calls.Move].self, forKey: .moves)
            retainedRoots = try saved.decodeIfPresent([URL].self, forKey: .retainedRoots) ?? []
            owners = try saved.decodeIfPresent([String: URL].self, forKey: .owners) ?? [:]
        }
    }
    private struct State {
        var recordingFolder: URL
        var journal = Journal()
    }
    private let state: Mutex<State>
    private let journal: URL?
    private let writeJournal: @Sendable (Journal, URL) throws -> Void
    private let makeCalls: @Sendable (URL) -> Calls
    // Every operation, including summary writes through withFolder, takes this turn,
    // so one waiting for a long folder move suspends instead of blocking a thread.
    private let turn = Turn()

    convenience init(folder: URL, timeZone: TimeZone, journal: URL? = nil, trash: @escaping @Sendable (URL) throws -> Void) {
        self.init(folder: folder, timeZone: timeZone, journal: journal, trash: trash, writeJournal: { record, journal in
            try FileManager.default.createDirectory(at: journal.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(record).write(to: journal, options: .atomic)
        })
    }
    convenience init(folder: URL, timeZone: TimeZone, journal: URL?, trash: @escaping @Sendable (URL) throws -> Void,
                     writeJournal: @escaping @Sendable (Journal, URL) throws -> Void) {
        var disk = CallsDisk.system
        disk.trash = trash
        self.init(folder: folder, journal: journal, writeJournal: writeJournal,
                  makeCalls: { [disk] in Calls(folder: $0, timeZone: timeZone, duration: TrackFile.duration(at:),
                                               transcript: Self.transcriptLines, disk: disk) })
    }
    /// A saved transcript's lines, read by the format's one reader.
    static func transcriptLines(_ markdown: String) -> [Calls.Text.Line] {
        TranscriptFormat.entries(markdown).map { .init(start: $0.start, words: $0.words, label: $0.label) }
    }

    init(folder: URL, journal: URL?, writeJournal: @escaping @Sendable (Journal, URL) throws -> Void,
         makeCalls: @escaping @Sendable (URL) -> Calls) {
        state = Mutex(State(recordingFolder: Self.directory(folder)))
        self.journal = journal; self.writeJournal = writeJournal; self.makeCalls = makeCalls
    }

    func restore() async throws {
        try await perform { [self] in
            guard let journal else { return }
            let data: Data
            do { data = try Data(contentsOf: journal) }
            catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
            do {
                let saved: Journal
                if let roots = try? JSONDecoder().decode([URL].self, from: data) {
                    guard !roots.isEmpty, roots.allSatisfy(\.isFileURL),
                          Set(roots.map(Self.directory)).count == roots.count else { throw CocoaError(.fileReadCorruptFile) }
                    var migrated = Journal(retainedRoots: roots.map(Self.directory))
                    // Read every retained root before replacing the legacy journal.
                    // An unavailable volume must not lose its ownership information.
                    for root in migrated.retainedRoots {
                        for call in try makeCalls(root).list() {
                            guard migrated.owners[call.id] == nil else { throw CocoaError(.fileReadCorruptFile) }
                            migrated.owners[call.id] = root
                        }
                    }
                    try save(migrated)
                    saved = migrated
                } else {
                    saved = try JSONDecoder().decode(Journal.self, from: data)
                }
                guard saved.retainedRoots.allSatisfy(\.isFileURL), saved.owners.values.allSatisfy(\.isFileURL) else {
                    throw CocoaError(.fileReadCorruptFile)
                }
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
            }
        }
    }
    private func save(_ record: Journal) throws {
        if let journal { try writeJournal(record, journal) }
    }
    private func record(_ move: Calls.Move, id: String, state: inout State) throws {
        var next = state.journal
        next.moves[id] = move
        next.owners.removeValue(forKey: id)
        try save(next)
        state.journal = next
    }
    private static func directory(_ url: URL) -> URL { URL(fileURLWithPath: url.standardizedFileURL.path, isDirectory: true) }
    private static func sameRoot(_ left: URL, _ right: URL) -> Bool {
        left.resolvingSymlinksInPath().standardizedFileURL.path == right.resolvingSymlinksInPath().standardizedFileURL.path
    }

    /// Retained volumes need not be mounted to reserve the calls they own.
    func occupiedCallNames() throws -> [String] {
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
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) async throws -> Value {
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
            return Self.sameRoot(owner, state.recordingFolder)
        }
        let otherRoots = Set((Array(state.journal.owners.values) + state.journal.moves.values.map { $0.owner.deletingLastPathComponent() }).map {
            Self.directory($0.resolvingSymlinksInPath())
        })
            .filter { !Self.sameRoot($0, state.recordingFolder) }
        for root in otherRoots {
            result += try makeCalls(root).list().filter { call in
                ownerRoot(id: call.id, state: state).map { Self.sameRoot($0, root) } == true
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
            try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).rename(id: id, title: title) }
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
                next.owners.removeValue(forKey: id)
                try save(next)
                state.journal = next
            }
        }
    }
    func location(id: String) async throws -> URL { try await perform { [self] in try folder(call: id) { $0 } } }
    /// A call's notes and transcript lines, for search.
    func text(id: String) async throws -> Calls.Text {
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
    let deleted: @Sendable (String) async -> Void
    func list() async throws -> [RecordedCall] {
        try await storage.list().map { .init(id: $0.id, title: $0.title, start: $0.start, duration: $0.duration) }
    }
    func rename(id: String, title: String) async throws { try await storage.rename(id: id, title: title) }
    func delete(id: String) async throws {
        try await storage.delete(id: id)
        await deleted(id)
    }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { try await storage.prepareMove(to: destination) }
    func move(id: String, to destination: URL) async throws -> Int64 { try await storage.move(id: id, to: destination) }
}
