import Calls
import Foundation
import Recordings
import SummaryFiles
import Synchronization

/// One transaction boundary for call mutations and note publication. It keeps
/// the calls journal, recovers moves a crash interrupted, runs every operation
/// one at a time, and refuses to delete, move or commit while a move is half finished.
public final class CallsStorage: SummaryFiles.Locations, Sendable {
    /// The saved bytes and original recording starts needed to merge a stored call.
    public struct Part: Equatable, Sendable {
        public let transcript: Data
        public let originalStarts: [Date]
        public init(transcript: Data, originalStarts: [Date]) {
            self.transcript = transcript; self.originalStarts = originalStarts
        }
    }

    private struct State {
        var recordingFolder: URL
        var journal = CallsJournal()
    }
    private let state: Mutex<State>
    private let journal: URL?
    private let writeJournal: @Sendable (CallsJournal, URL) throws -> Void
    private let readPart: @Sendable (URL, String) throws -> Part
    private let makeCalls: @Sendable (URL) -> Calls
    // Every operation, including summary writes through withFolder, takes this turn,
    // so one waiting for a long folder move suspends instead of blocking a thread.
    private let operation: CallsStorageGuard
    private let published = Mutex<(state: CallsTransaction, watchers: [UUID: AsyncStream<CallsTransaction>.Continuation])>((.idle, [:]))
    /// The calls-folder claim: the current grant, if any, and the last token handed out.
    let folderClaim = Mutex<(holder: (CallsFolderHolder, CallsFolderToken)?, lastToken: UInt64)>((nil, 0))

    /// `journal` is where the journal is kept; nil keeps it in memory only.
    /// `makeCalls` opens the calls of one folder; `readPart` reads a resolved call folder for merging.
    public init(folder: URL, journal: URL?, writeJournal: @escaping @Sendable (CallsJournal, URL) throws -> Void = CallsStorage.writeAtomically,
                readPart: @escaping @Sendable (URL, String) throws -> Part,
                makeCalls: @escaping @Sendable (URL) -> Calls,
                operation: CallsStorageGuard = .serial()) {
        self.operation = operation
        state = Mutex(State(recordingFolder: directory(folder)))
        self.readPart = readPart
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

    /// Recovers interrupted folder changes and reconciles published splits before startup lists calls.
    public func restore() async throws {
        try await perform { [self] in
            try state.withLock { state in
                if let saved = try readJournal() { state.journal = saved }
                // A transcript is changed in the folder that owns its call, so each owning folder
                // is put back before any of its calls is listed or moved on.
                let active = state.recordingFolder
                try recoverInterruptedChanges(in: active, state: &state)
                for root in otherRoots(state) { try recoverInterruptedChanges(in: root, state: &state) }
                recover(&state)
            }
        }
    }
    private func readJournal() throws -> CallsJournal? {
        guard let journal else { return nil }
        let data: Data
        do { data = try Data(contentsOf: journal) }
        catch CocoaError.fileReadNoSuchFile { return nil }
        let (saved, migrated) = try CallsJournal.read(data) { [makeCalls] root in try makeCalls(root).list().map(\.id) }
        if migrated { try save(saved) }
        return saved
    }
    private func recoverInterruptedChanges(in root: URL, state: inout State) throws {
        // A folder that is not there, such as one on an unmounted volume, holds no change.
        guard FileManager.default.fileExists(atPath: root.path) else { return }
        try makeCalls(root).recoverInterruptedMerges {
            try registerSplit(.init(first: $0.first, second: $0.second), in: root, state: &state)
        }
    }
    /// The folders other than the calls folder that the journal says own a call.
    private func otherRoots(_ state: State) -> [URL] {
        let roots = Set((Array(state.journal.owners.values) + state.journal.moves.values.map { $0.owner.deletingLastPathComponent() }).map {
            directory($0.resolvingSymlinksInPath())
        })
        return roots.filter { !sameRoot($0, state.recordingFolder) }.sorted { $0.path < $1.path }
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
    private func registerSplit(_ parts: SplitReplacement, in root: URL, state: inout State) throws {
        var next = state.journal
        // The active directory indexes its own calls. Clear any records that would
        // route the published ids away from their new folders.
        let owner = sameRoot(root, state.recordingFolder) ? nil : root
        for id in [parts.first, parts.second] {
            next.moves.removeValue(forKey: id)
            next.owners[id] = owner
        }
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
    private func perform<Value: Sendable>(_ kind: CallsStorageGuard.Operation = .access, _ work: () throws -> Value) async throws -> Value {
        try await operation.take(kind)
        defer { operation.give() }
        return try work()
    }
    private func list(_ state: State) throws -> [Calls.Call] {
        var result = try makeCalls(state.recordingFolder).list().filter {
            guard let owner = ownerRoot(id: $0.id, state: state) else { return true }
            return sameRoot(owner, state.recordingFolder)
        }
        for root in otherRoots(state) {
            result += try makeCalls(root).list().filter { call in
                ownerRoot(id: call.id, state: state).map { sameRoot($0, root) } == true
            }
        }
        return result.sorted { $0.id > $1.id }
    }
    public func list() async throws -> [Calls.Call] {
        try await list { call, _ in call }
    }
    /// The listed calls, each passed with its resolved folder, wherever its root, to `enrich`
    /// within this storage's turn; `enrich` must not call back into storage.
    public func list<Value: Sendable>(_ enrich: @Sendable (Calls.Call, URL) throws -> Value) async throws -> [Value] {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state)
                return try list(state).map { try enrich($0, location(id: $0.id, state: state)) }
            }
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
    /// Changes a call's tags: `write` gets the call's resolved folder within this storage's
    /// turn. A call a folder move is still copying is not written.
    public func writeTags(id: String, _ write: @Sendable (URL) throws -> Void) async throws {
        try await perform { [self] in
            try state.withLock { state in
                recover(&state, id: id)
                if let move = state.journal.moves[id], ![.source, .destination].contains(move.phase) {
                    throw CocoaError(.fileWriteUnknown)
                }
                try write(location(id: id, state: state))
            }
        }
    }
    /// A call's saved transcript as written, for a merge to read back.
    public func savedTranscript(id: String) async throws -> Data {
        try await perform { [self] in try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).savedTranscript(id: id) } }
    }

    /// Resolves original recordings through the same disk binding as listing.
    public func originals(id: String) async throws -> [Calls.Original] {
        try await perform { [self] in try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).originals(id: id) } }
    }

    /// Publishes within the same turn as every read and mutation of this call.
    public func publishTranscript(id: String, write: @escaping @Sendable (URL) throws -> Void) async throws {
        try await perform(.publishTranscript) { [self] in try folder(call: id) { try Task.checkCancellation(); try makeCalls($0.deletingLastPathComponent()).publishTranscript(id: id, write: write) } }
    }

    public func restorePreviousTranscript(id: String) async throws {
        try await perform(.restorePreviousTranscript) { [self] in try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).restorePreviousTranscript(id: id) } }
    }
    /// Reads a merge part within the same turn that resolves its folder.
    public func part(id: String) async throws -> Part {
        try await perform { [self] in try folder(call: id) { try readPart($0, id) } }
    }

    /// Merges calls of the calls folder into one, the earliest part's, with what `write`
    /// puts in the prepared folder it is given beside the parts' resolved folders, in the
    /// order of `ids`, within this storage's turn; returns the merged call's id. A failing
    /// `write` fails the merge with every part back in place.
    /// A call that a folder move holds or left in another folder is not merged.
    public func merge(ids: [String], write: @Sendable (_ prepared: URL, _ parts: [URL]) throws -> Void) async throws -> String {
        try await perform { [self] in
            try state.withLock { state in
                for id in ids {
                    recover(&state, id: id)
                    guard state.journal.moves[id] == nil,
                          sameRoot(try location(id: id, state: state).deletingLastPathComponent(), state.recordingFolder)
                    else { throw CocoaError(.fileWriteUnknown) }
                }
                return try makeCalls(state.recordingFolder).merge(ids: ids, write: write)
            }
        }
    }

    public enum SplitFailure: Error, Equatable, Sendable {
        case inactive(id: String)
        case heldByMove(id: String)
        case expiredTranscript(id: String)
    }

    public struct SplitRequest: Sendable {
        public let root: URL
        public let id: String
        public let expectedTranscript: String
        public let reservedIDs: Set<String>
    }

    public struct SplitReplacement: Equatable, Sendable {
        public let first: String
        public let second: String

        public init(first: String, second: String) {
            self.first = first; self.second = second
        }
    }

    /// The folder transaction confirms the transcript and publishes both parts.
    /// It calls registration after publication and retains recovery if registration fails.
    public typealias SplitFolders = @Sendable (
        _ request: SplitRequest, _ register: (SplitReplacement) throws -> Void
    ) throws -> SplitReplacement

    private func splitRoot(id: String, state: State) throws -> URL {
        if folderClaim.withLock({ $0.holder?.0 == .move }) { throw SplitFailure.heldByMove(id: id) }
        if let move = state.journal.moves[id], ![.source, .destination].contains(move.phase) {
            throw SplitFailure.heldByMove(id: id)
        }
        let root = state.recordingFolder
        if let owner = ownerRoot(id: id, state: state), !sameRoot(owner, root) { throw SplitFailure.inactive(id: id) }
        return root
    }

    /// Reads the bytes used for split choices together with their identity, within the storage turn.
    public func splitTranscript(id: String) async throws -> Calls.SplitTranscript {
        try await perform { [self] in
            try state.withLock { state in try makeCalls(splitRoot(id: id, state: state)).splitTranscript(id: id) }
        }
    }

    /// Reserves the journal's ids and runs the folder transaction within the storage turn.
    public func split(id: String, expectedTranscript: String, replace: SplitFolders) async throws -> SplitReplacement {
        try await perform { [self] in
            try state.withLock { state in
                let root = try splitRoot(id: id, state: state)
                let reserved = Set(state.journal.moves.keys).union(state.journal.owners.keys)
                guard try makeCalls(root).transcriptFacts(id: id).identity == expectedTranscript else {
                    throw SplitFailure.expiredTranscript(id: id)
                }
                return try replace(.init(root: root, id: id, expectedTranscript: expectedTranscript,
                                         reservedIDs: reserved)) {
                    try registerSplit($0, in: root, state: &state)
                }
            }
        }
    }

    public func location(id: String) async throws -> URL { try await perform { [self] in try folder(call: id) { $0 } } }
    /// A call's transcript lines.
    public func text(id: String) async throws -> Calls.Text {
        try await perform { [self] in try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).text(id: id) } }
    }
    /// A call's transcript identity and previous-transcript flag, read without listing every call.
    public func transcriptFacts(id: String) async throws -> Calls.TranscriptFacts {
        try await perform { [self] in try folder(call: id) { try makeCalls($0.deletingLastPathComponent()).transcriptFacts(id: id) } }
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
