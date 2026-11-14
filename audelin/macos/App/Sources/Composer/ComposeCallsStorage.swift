import Calls
import CallsStorage
import Foundation
import Recordings
import SummaryJobs
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

/// A saved transcript's lines, read by the format's one reader.
func transcriptLines(_ markdown: String) -> [Calls.Text.Line] {
    TranscriptFormat.entries(markdown).map { .init(start: $0.start, words: $0.words, label: $0.label) }
}

struct SummaryCalls: RecordingsCalls {
    let storage: CallsStorage
    let deleted: @Sendable (String) async -> Void
    /// Hands the notes side the merged call, its parts and the joined transcript's entries.
    var merged: @Sendable (String, [String], [Job.Entry]) async -> Void = { _, _, _ in }
    /// Writes a merged call's joined transcript.
    var binding: any TranscriptFileBinding = DiskTranscriptBinding()
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
    func merge(ids: [String]) async throws -> String {
        let merged = try await mergeCalls(ids: ids, storage: storage, binding: binding)
        await self.merged(merged.id, ids, merged.entries)
        return merged.id
    }
}
