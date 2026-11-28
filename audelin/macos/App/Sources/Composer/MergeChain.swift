import CallTags
import Calls
import CallsStorage
import Foundation
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

/// Joins the saved transcripts and stages the joined transcript, tags and notes
/// in the folder that becomes the merged call.
func mergeCalls(ids: [String], storage: CallsStorage, binding: any TranscriptFileBinding, release: TranscriptFormat.Release,
                stageNotes: (@Sendable (Data, URL) throws -> Void)?) async throws -> String {
    let listed = Dictionary(try await storage.list().map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var parts: [TranscriptJoin.Part<TranscriptFormat.Segment, TranscriptFormat.Speaker, TranscriptFormat.CallOrigin?>] = []
    var hasExplicitStart = false
    for id in ids {
        guard let call = listed[id], let length = call.duration else { throw CallsFailure.unknownLength(id: id) }
        let part = try await storage.part(id: id)
        let saved = TranscriptFormat.read(String(decoding: part.transcript, as: UTF8.self))
        let originals = saved.origin?.calls.map { TranscriptJoin.Original(start: $0.start, origin: $0.origin) }
            ?? part.originalStarts.map { TranscriptJoin.Original<TranscriptFormat.CallOrigin?>(start: $0, origin: nil) }
        let start = saved.origin?.timelineStart
        hasExplicitStart = hasExplicitStart || start != nil
        parts.append(.init(start: start ?? call.start, length: length, rows: saved.segments, speakers: saved.speakers, originals: originals))
    }
    let joined = TranscriptJoin.join(parts)
    let existingGaps = joined.items.compactMap { item -> TranscriptFormat.Segment? in
        guard case let .row(row) = item, row.side == .gap else { return nil }
        return row
    }
    let segments = joined.items.compactMap { item -> TranscriptFormat.Segment? in
        switch item {
        case let .row(row): return row
        case let .gap(at, length):
            // A split at a pre-existing gap can bring its marker back with the first part.
            let gap = TranscriptFormat.Segment.gap(at: at.rounded(.down), length: length.rounded(.down))
            return existingGaps.contains(gap) ? nil : gap
        }
    }
    var format = TranscriptFormat()
    let origin = TranscriptFormat.Origin(calls: joined.originals.map { .init(start: $0.start, origin: $0.origin) },
        mergedBy: release, timelineStart: hasExplicitStart ? parts.map(\.start).min() : nil)
    let bytes = try format.render(segments, speakers: joined.speakers, origin: origin).chunks.reduce(into: Data()) { $0.append($1) }
    return try await storage.merge(ids: ids) { folder, partFolders in
        // Earliest part first: a call folder is named by its start.
        let ordered = partFolders.sorted { $0.lastPathComponent < $1.lastPathComponent }
        let tags = CallTags.normalized(try ordered.flatMap { try TagsFile.read(in: $0) })
        try writeReplacementTranscript(bytes, in: folder, binding: binding)
        try TagsFile.write(tags, in: folder)
        try stageNotes?(bytes, folder)
    }
}
