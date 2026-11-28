import Calls
import CallsStorage
import Foundation
import Recordings
import SplitPoints
import SplitPreparation
import TagsFile
import TrackFile
import TranscriptFile
import TranscriptFormat
import TranscriptSplit

extension TranscriptFormat.Segment: SplitRow {
    public func moved(to time: Double) -> Self { moved(to: time, speaker: speaker) }
}

extension TranscriptFormat.Speaker: SplitSpeaker {}

private struct SplitPoint: SplitPointEntry {
    let start: Int
    let row: TranscriptFormat.Segment
    var words: String? { row.settled }
}

private typealias FileSplit = SplitPreparation<Calls.SplitSource, Calls.SplitRecording, Data>

struct SplitPorts: RecordingsSplitChoices, RecordingsSplit {
    private let preparation: FileSplit

    init(storage: CallsStorage, calls: @escaping @Sendable (URL) -> Calls,
         binding: any TranscriptFileBinding, notes: ReplacementNotes) {
        preparation = FileSplit(read: { id in
            let saved = try await storage.splitTranscript(id: id)
            return .init(bytes: saved.bytes, identity: saved.identity, folderStart: saved.folderStart)
        }, suggest: { snapshot in
            let saved = TranscriptFormat.read(String(decoding: snapshot.bytes, as: UTF8.self))
            return suggestions(saved, folderStart: snapshot.folderStart).compactMap { choice in
                guard let before = choice.before.words, let after = choice.after.words else { return nil }
                return .init(before: before, after: after, cut: choice.cut, gap: choice.gap,
                             suggestsTransition: choice.suggestsTransition, secondPartMinute: choice.secondPartMinute,
                             beforeSpeaker: TranscriptFormat.namedLabel(choice.before.row, speakers: saved.speakers),
                             afterSpeaker: TranscriptFormat.namedLabel(choice.after.row, speakers: saved.speakers))
            }
        }, replace: { request, prepare, cutTrack in
            let replacement = try await storage.split(id: request.id, expectedTranscript: request.identity) { turn, register in
                let parts = try calls(turn.root).split(id: turn.id, expectedTranscript: turn.expectedTranscript,
                    firstTitle: request.firstTitle, secondTitle: request.secondTitle, reservedIDs: turn.reservedIDs,
                    plan: { source in
                        let staged = try prepare(source)
                        return .init(firstStart: staged.firstStart, secondStart: staged.secondStart,
                                     recordings: staged.recordings, write: staged.write)
                    }, cut: cutTrack, register: { try register(.init(first: $0.first, second: $0.second)) })
                return .init(first: parts.first, second: parts.second)
            }
            return (replacement.first, replacement.second)
        }, partition: splitPlan, writeTranscript: { try writeReplacementTranscript($0, in: $1, binding: binding) },
           readTags: { try TagsFile.read(in: $0.folder) }, writeTags: { try TagsFile.write($0, in: $1) },
           notes: { notes.snapshot(reuseSpeakerLabels: true) }, cutTrack: { try TrackFile.split(at: $0, source: $1, before: $2, after: $3) })
    }

    func splitChoices(id: String) async throws -> SplitChoices {
        do {
            let result = try await preparation.choices(id: id)
            return .init(transcriptIdentity: result.identity, choices: result.choices.map {
                .init(before: $0.before, after: $0.after, cut: $0.cut, gap: $0.gap,
                      suggestsTransition: $0.suggestsTransition, secondPartMinute: $0.secondPartMinute,
                      beforeSpeaker: $0.beforeSpeaker, afterSpeaker: $0.afterSpeaker)
            })
        } catch { throw splitError(error) }
    }

    func split(_ request: Recordings.SplitRequest) async throws -> Recordings.SplitReplacement {
        do {
            let result = try await preparation.split(.init(id: request.id, identity: request.transcriptIdentity, cut: request.cut,
                                                           firstTitle: request.firstTitle, secondTitle: request.secondTitle))
            return .init(first: result.first, second: result.second)
        } catch { throw splitError(error) }
    }
}

private func splitError(_ error: any Error) -> any Error {
    switch error {
    case CallsStorage.SplitFailure.inactive: SplitRefusal.inactiveFolder
    case CallsStorage.SplitFailure.heldByMove: SplitRefusal.folderMove
    case CallsStorage.SplitFailure.busy: SplitRefusal.busy
    case CallsStorage.SplitFailure.journalUnavailable: SplitRefusal.journalUnavailable
    case CallsFailure.invalidTitle: SplitRefusal.invalidTitle
    case CallsStorage.SplitFailure.expiredTranscript, Calls.SplitFailure.expiredTranscript: SplitRefusal.expiredTranscript
    case let Calls.SplitFailure.committed(parts, reason):
        SplitRefusal.committed(.init(first: parts.first, second: parts.second), reason: reason)
    case let Calls.SplitFailure.recoveryRequired(reason): SplitRefusal.recoveryRequired(reason)
    default: error
    }
}

private func suggestions(_ saved: TranscriptFormat.Saved, folderStart: Date) -> [SplitPoints.Choice<SplitPoint>] {
    let entries = saved.segments.compactMap { row -> SplitPoint? in
        guard row.side != .gap, let start = Int(exactly: row.start) else { return nil }
        return SplitPoint(start: start, row: row)
    }
    return SplitPoints.choices(for: entries, timelineStart: saved.origin?.timelineStart ?? folderStart)
}

private struct SplitOriginal {
    let folder: URL
    let origin: TranscriptFormat.CallOrigin?
}

private func splitPlan(_ source: Calls.SplitSource, at cut: Int) throws -> FileSplit.Plan {
    let saved = TranscriptFormat.read(String(decoding: source.transcript, as: UTF8.self))
    guard suggestions(saved, folderStart: source.folderStart).contains(where: { $0.cut == cut }) else {
        throw SplitRefusal.invalidChoice
    }

    let known = saved.origin?.calls.sorted { $0.start < $1.start } ?? []
    // Older transcripts recorded the original's start at finer precision than its folder.
    let originals = source.recordings.enumerated().map { index, recording in
        let origin = known.count == source.recordings.count ? known[index].origin
            : known.first { $0.start == recording.start }?.origin
        return TranscriptSplit.Original(start: recording.start, length: recording.duration,
                                         origin: SplitOriginal(folder: recording.callTrack.deletingLastPathComponent(), origin: origin))
    }
    let parts = TranscriptSplit.split(timelineStart: saved.origin?.timelineStart ?? source.folderStart,
                                      at: cut, rows: saved.segments, speakers: saved.speakers, originals: originals)

    let cuts = Dictionary(uniqueKeysWithValues: parts.after.recordings.filter { $0.sourceOffset > 0 }.map {
        ($0.original.origin.folder, $0.sourceOffset)
    })
    let first = parts.before.recordings.map { recording -> Calls.SplitRecording in
        let folder = recording.original.origin.folder
        if let offset = cuts[folder] { return .cut(folder: folder, offset: offset) }
        return .whole(folder: folder, side: .first)
    }
    let second = parts.after.recordings.filter { $0.sourceOffset == 0 }.map {
        Calls.SplitRecording.whole(folder: $0.original.origin.folder, side: .second)
    }

    func render(_ part: TranscriptSplit.Part<TranscriptFormat.Segment, TranscriptFormat.Speaker, SplitOriginal>) throws -> FileSplit.Part {
        let origin = TranscriptFormat.Origin(calls: part.recordings.map {
            .init(start: $0.start, origin: $0.original.origin.origin)
        }, mergedBy: saved.origin?.mergedBy, timelineStart: part.timelineStart)
        var format = TranscriptFormat()
        return .init(start: part.timelineStart,
                     transcript: try format.render(part.rows, speakers: part.speakers, origin: origin).chunks.reduce(into: Data()) { $0.append($1) })
    }
    return try .init(first: render(parts.before), second: render(parts.after), recordings: first + second)
}
