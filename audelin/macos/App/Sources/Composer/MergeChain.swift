import CallTags
import Calls
import CallsStorage
import Foundation
import SummaryJobs
import TagsFile
import TranscriptFile
import TranscriptFormat
import TranscriptJoin

extension TranscriptFormat.Segment: JoinRow {
    public var time: Double { start }
    public func moved(to time: Double, speaker: String?) -> Self {
        switch side {
        case .gap: .gap(at: time, length: gapLength ?? 0)
        case .mine, .theirs:
            .init(side: side, start: time, settled: settled, pending: pending, filledInLater: filledInLater, speaker: speaker)
        }
    }
}

extension TranscriptFormat.Speaker: JoinSpeaker {
    public var key: String { id }
    public func keyed(_ key: String) -> Self { .init(id: key, name: name, state: state) }
}

/// Answers Recordings' merge port: Calls reads each part's saved transcript,
/// Transcript format reads it back, Transcript join joins the parts, Transcript format
/// renders the joined call, Transcript file writes it into the folder Calls prepares
/// with every part's tags, and Calls arranges the folders. A part whose tags cannot be
/// read fails the merge, as a failed write does, and the parts stay as they were. Returns the merged call's id and the joined
/// transcript's entries for its notes.
func mergeCalls(ids: [String], storage: CallsStorage, binding: any TranscriptFileBinding) async throws -> (id: String, entries: [Job.Entry]) {
    let listed = Dictionary(try await storage.list().map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var parts: [TranscriptJoin.Part<TranscriptFormat.Segment, TranscriptFormat.Speaker>] = []
    for id in ids {
        guard let call = listed[id], let length = call.duration else { throw CallsFailure.unknownLength(id: id) }
        let saved = TranscriptFormat.read(String(decoding: try await storage.savedTranscript(id: id), as: UTF8.self))
        parts.append(.init(start: call.start, length: length, rows: saved.segments, speakers: saved.speakers))
    }
    let joined = TranscriptJoin.join(parts)
    let segments = joined.items.map { item -> TranscriptFormat.Segment in
        switch item {
        case let .row(row): row
        case let .gap(at, length): .gap(at: at, length: length)
        }
    }
    var format = TranscriptFormat()
    let chunks = try format.render(segments, speakers: joined.speakers).chunks
    let entries = summaryEntries(segments, speakers: joined.speakers)
    let id = try await storage.merge(ids: ids) { folder, partFolders in
        // Earliest part first: a call folder is named by its start.
        let ordered = partFolders.sorted { $0.lastPathComponent < $1.lastPathComponent }
        let tags = CallTags.normalized(try ordered.flatMap { try TagsFile.read(in: $0) })
        let url = folder.appendingPathComponent("transcript.md")
        let file = try binding.create(at: url)
        do {
            for chunk in chunks { try file.write(chunk) }
            try file.flush()
        } catch {
            binding.remove(at: url)
            throw error
        }
        try TagsFile.write(tags, in: folder)
    }
    return (id, entries)
}
