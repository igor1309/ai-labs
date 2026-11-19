import CallTags
import Calls
import CallsStorage
import Foundation
import Recording
import Recordings
import SummaryJobs
import TagsFile
import TrackFile
import TranscriptFile
import TranscriptFormat

/// The calls storage over the system disk, reading audio duration and transcript lines.
func callsStorage(folder: URL, timeZone: TimeZone, journal: URL? = nil, trash: @escaping @Sendable (URL) throws -> Void,
                  writeJournal: @escaping @Sendable (CallsJournal, URL) throws -> Void = CallsStorage.writeAtomically) -> CallsStorage {
    var disk = CallsDisk.system
    disk.trash = trash
    return CallsStorage(folder: folder, journal: journal, writeJournal: writeJournal,
                        makeCalls: { [disk] in Calls(folder: $0, timeZone: timeZone, duration: TrackFile.duration(at:),
                                                     transcript: transcriptLines, disk: disk) })
}

/// Recording's port to the calls-folder claim, answered by the one CallsStorage.
struct RecordingFolderClaim: Sendable {
    let take: @Sendable () async -> CallsFolderAnswer
    let release: @Sendable (UInt64) async -> Void

    init(storage: CallsStorage) {
        take = {
            switch storage.takeFolder(for: .recording) {
            case let .granted(token): .granted(token: token.rawValue)
            case .refused(by: .move): .refusedByMove
            case .refused: .refused
            }
        }
        release = { storage.releaseFolder(CallsFolderToken(rawValue: $0)) }
    }
}

/// Recordings' port to the calls-folder claim for a move, answered by the one CallsStorage.
struct MoveFolderClaim: Sendable {
    let take: @Sendable () async -> UInt64?
    let release: @Sendable (UInt64) async -> Void

    init(storage: CallsStorage) {
        take = {
            guard case let .granted(token) = storage.takeFolder(for: .move) else { return nil }
            return token.rawValue
        }
        release = { storage.releaseFolder(CallsFolderToken(rawValue: $0)) }
    }
}

/// Lifecycle's port to the calls-folder claim for a relaunch, answered by the one CallsStorage.
struct RelaunchFolderClaim: Sendable {
    let take: @Sendable () async -> UInt64?
    let release: @Sendable (UInt64) async -> Void

    init(storage: CallsStorage) {
        take = {
            guard case let .granted(token) = storage.takeFolder(for: .relaunch) else { return nil }
            return token.rawValue
        }
        release = { storage.releaseFolder(CallsFolderToken(rawValue: $0)) }
    }
}

/// A saved transcript's lines, read by the format's one reader.
func transcriptLines(_ markdown: String) -> [Calls.Text.Line] {
    TranscriptFormat.namedEntries(markdown).map { .init(start: $0.start, words: $0.words, label: $0.label) }
}

struct SummaryCalls: RecordingsCalls {
    let storage: CallsStorage
    let release: TranscriptFormat.Release
    let deleted: @Sendable (String) async -> Void
    /// Hands the notes side the merged call, its parts and the joined transcript's entries.
    var merged: @Sendable (String, [String], [Job.Entry]) async -> Void = { _, _, _ in }
    /// Records each delete, by the call's start only: the title can name people.
    var log: (any LogSink)? = nil
    /// Writes a merged call's joined transcript.
    var binding: any TranscriptFileBinding = DiskTranscriptBinding()
    /// Each call with its tags as first written; a tags file that cannot be read marks the call's tags unreadable.
    func list() async throws -> [RecordedCall] {
        try await storage.list { call, folder in
            let tags: RecordedCall.Tags = (try? TagsFile.read(in: folder)).map { .known(CallTags.normalized($0)) } ?? .unreadable
            return RecordedCall(id: call.id, title: call.title, start: call.start, duration: call.duration, tags: tags)
        }
    }
    func rename(id: String, title: String) async throws { try await storage.rename(id: id, title: title) }
    func delete(id: String) async throws {
        let call = String(id.prefix("yyyy.MM.dd-HHmm".count))
        do { try await storage.delete(id: id) }
        catch { log?.write(.init(category: .calls, message: "delete failed call=\(call)", error: String(describing: error))); throw error }
        log?.write(.init(category: .calls, message: "deleted call=\(call) to Trash"))
        await deleted(id)
    }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { try await storage.prepareMove(to: destination) }
    func move(id: String, to destination: URL) async throws -> Int64 { try await storage.move(id: id, to: destination) }
    func merge(ids: [String]) async throws -> String {
        let merged = try await mergeCalls(ids: ids, storage: storage, binding: binding, release: release)
        await self.merged(merged.id, ids, merged.entries)
        return merged.id
    }
    func setTags(id: String, tags: [String]) async throws {
        try await storage.writeTags(id: id) { try TagsFile.write(tags, in: $0) }
    }
}

/// Search and list gists join Current notes with the call's transcript at composition.
struct CallsText: Sendable {
    let notes: String?
    let transcript: [Calls.Text.Line]
}
