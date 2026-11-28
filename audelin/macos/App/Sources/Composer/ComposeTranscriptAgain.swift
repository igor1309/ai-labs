import BleedCleanup
import Calls
import CallsStorage
import Foundation
import LiveText
import struct LiveText.Word
import ReRecognition
import SpeakerAttribution
import TrackFile
import TranscriptFile
import TranscriptFormat
import TranscriptJoin

func transcriptAgain(storage: CallsStorage, boundary: ComposerBoundary,
                     describe: @escaping @Sendable (any Error) -> String) -> TranscriptAgainChain {
    let ports = TranscriptAgainPorts(storage: storage, boundary: boundary, binding: DiskTranscriptBinding())
    return TranscriptAgainChain(originals: ports.originals, recognition: ReRecognition(
        hear: ports.hear, split: ports.split, clean: ports.clean, readOld: ports.readOld,
        names: ReRecognition.carryNames, publish: ports.publish),
        build: .init(version: boundary.transcriptBuild.release.version, number: boundary.transcriptBuild.release.build), describe: describe)
}

/// Translates kept calls into the same hearing, attribution and cleanup used for recordings.
struct TranscriptAgainPorts: Sendable {
    let storage: CallsStorage
    let boundary: ComposerBoundary
    let binding: any TranscriptFileBinding

    func originals(_ id: String) async throws -> [ReRecognition.OriginalCall] {
        let originals = try await storage.originals(id: id)
        guard let first = originals.first else { throw CallsFailure.notFound(id: id) }
        let origin = (try? await savedTranscript(id))?.origin
        let start = origin?.timelineStart ?? first.start
        return zip(originals, recordingStarts(originals, origin: origin)).map { original, recordedStart in
            .init(id: original.id, farTrack: original.callTrack.path, microphoneTrack: original.microphoneTrack.path,
                  duration: original.duration, start: recordedStart.timeIntervalSince(start))
        }
    }

    func hear(_ path: String, progress: ReRecognition.Fraction) async throws -> ReRecognition.Heard {
        let url = URL(fileURLWithPath: path)
        let mine = url.lastPathComponent == "microphone.caf"
        let side: ComposerSide = mine ? .microphone : .call
        let text = RecognitionStream(recognizerSource: { BoundaryRecognizer(base: try await boundary.recognizers.recognizer(for: side)) })
        do {
            try await text.prepare()
            try await TrackFile.readSaved(at: url) { chunk in
                _ = try await text.hear(.init(start: chunk.start, samples: chunk.samples, sampleRate: TrackFile.sampleRate))
                await progress(chunk.fraction)
            }
            let result = try await text.finish()
            return .init(words: (result.final + result.tail).flatMap(\.words).map(Self.word),
                         model: mine ? boundary.transcriptBuild.mine : boundary.transcriptBuild.theirs)
        } catch {
            await text.shutdown()
            throw error
        }
    }

    func split(_ original: ReRecognition.OriginalCall, words: [ReRecognition.Word]) async throws -> ReRecognition.Split? {
        let result = try await boundary.diarizer.diarize(URL(fileURLWithPath: original.farTrack), speakers: nil)
        guard !result.turns.isEmpty else { return nil }
        let pieces = SpeakerAttribution().attribute(segments(words), turns: result.turns.map { .init(speaker: $0.speaker, start: $0.start, end: $0.end) })
        var order: [Int] = [], grouped: [Int: [ReRecognition.Word]] = [:]
        for piece in pieces {
            // Unattributed words remain a distinct, unnamed speaker.
            let id = piece.speaker ?? -1
            if grouped[id] == nil { order.append(id) }
            grouped[id, default: []] += piece.segment.words.map(Self.word)
        }
        return .init(speakers: order.map { .init(id: $0, name: nil, words: grouped[$0] ?? []) },
                     diarizer: result.model == .nemotron ? "nemotron" : "vbx")
    }

    func clean(_ original: ReRecognition.OriginalCall, microphone: [ReRecognition.Word], far: [ReRecognition.Speaker]) async throws -> [ReRecognition.Word]? {
        return await TranscriptCleanup(recording: .init(microphoneURL: URL(fileURLWithPath: original.microphoneTrack), callURL: URL(fileURLWithPath: original.farTrack)),
            duration: { original.duration }, cleaning: boundary.bleedCleaning, hearing: boundary.bleedHearing, sink: boundary.log)
            .run(microphone: microphone.map { .init(start: $0.time.start, text: $0.text) },
                 call: far.flatMap(\.words).sorted { $0.time.start < $1.time.start }.map { .init(start: $0.time.start, text: $0.text) })?.flatMap(\.words).map(Self.word)
    }

    func readOld(_ id: String) async throws -> [ReRecognition.OldSpeaker] {
        let saved = try await savedTranscript(id)
        let duration = try await storage.list().first { $0.id == id }?.duration ?? 0
        return saved.speakers.map { speaker in
            .init(name: speaker.name, ranges: saved.segments.enumerated().compactMap { index, row in
                guard row.side == .theirs, row.speaker == speaker.id else { return nil }
                let end = index + 1 < saved.segments.count ? saved.segments[index + 1].start : duration
                return end > row.start ? .init(start: row.start, end: end) : nil
            })
        }
    }

    func publish(_ id: String, transcript: ReRecognition.Transcript) async throws {
        let saved = try await savedTranscript(id)
        let originals = try await storage.originals(id: id)
        let starts = Dictionary(uniqueKeysWithValues: zip(originals.map { $0.callTrack.path },
                                                          recordingStarts(originals, origin: saved.origin)))
        let parts: [TranscriptJoin.Part<TranscriptFormat.Segment, TranscriptFormat.Speaker, TranscriptFormat.CallOrigin?>] = try transcript.originals.map { part in
            guard let start = starts[part.original.farTrack] else { throw CallsFailure.notFound(id: part.original.id) }
            let release = TranscriptFormat.Release(version: part.origin.build.version, build: part.origin.build.number)
            let split: TranscriptFormat.Split = switch part.origin.splitting {
            case let .done(diarizer): .done(diarizer: diarizer, release: release)
            case .nothingKept: .nothingKept(release: release)
            }
            let origin = TranscriptFormat.CallOrigin(hearing: release, mine: part.origin.microphoneModel, theirs: part.origin.farModel,
                split: split, cleaning: .init(outcome: part.origin.cleaning == .done ? .done : .nothingKept, release: release))
            let speakers = part.far.map { TranscriptFormat.Speaker(id: String($0.id), name: $0.name, state: $0.name == nil ? "diarized" : "confirmed") }
            let far = self.farRows(part.far)
            let combined = (far + self.rows(part.microphone, side: .mine)).sorted { $0.start < $1.start }
            return TranscriptJoin.Part(start: start, length: part.original.duration,
                rows: combined, speakers: speakers, originals: [.init(start: start, origin: Optional(origin))])
        }
        let joined = TranscriptJoin.join(parts)
        // Joining measures from the earliest recording. A split's saved clock can start before it.
        // Legacy rows stay relative to the first recording, displayed from the folder minute.
        let offset = saved.origin?.timelineStart.flatMap { timeline in
            joined.originals.first?.start.timeIntervalSince(timeline)
        } ?? 0
        let rows = joined.items.map { item -> TranscriptFormat.Segment in
            switch item {
            case let .row(row): row.moved(to: row.start + offset, speaker: row.speaker)
            case let .gap(at, length): .gap(at: at + offset, length: length)
            }
        }
        var format = TranscriptFormat()
        let chunks = try format.render(rows, speakers: joined.speakers,
            origin: .init(calls: joined.originals.map { .init(start: $0.start, origin: $0.origin) },
                          mergedBy: transcript.merger.map { .init(version: $0.version, build: $0.number) },
                          timelineStart: saved.origin?.timelineStart)).chunks
        try await storage.publishTranscript(id: id) { url in
            let file = try binding.create(at: url)
            do { for chunk in chunks { try Task.checkCancellation(); try file.write(chunk) }; try file.flush() }
            catch { binding.remove(at: url); throw error }
        }
    }

    private func recordingStarts(_ recordings: [Calls.Original], origin: TranscriptFormat.Origin?) -> [Date] {
        // An explicit transcript clock can predate recording start files.
        guard let origin, origin.timelineStart != nil, origin.calls.count == recordings.count else {
            return recordings.map(\.start)
        }
        return zip(recordings, origin.calls).map { recording, saved in
            recording.hasRecordedStart ? recording.start : saved.start
        }
    }

    private func savedTranscript(_ id: String) async throws -> TranscriptFormat.Saved {
        TranscriptFormat.read(String(decoding: try await storage.savedTranscript(id: id), as: UTF8.self))
    }

    /// The far side in call order: the split hands each speaker's words together, so a speaker
    /// who talks again after another is a new row, as each attributed piece is in a live call.
    private func farRows(_ speakers: [ReRecognition.Speaker]) -> [TranscriptFormat.Segment] {
        let words = speakers.flatMap { speaker in speaker.words.map { (speaker: speaker.id, word: $0) } }
            .enumerated().sorted { ($0.element.word.time.start, $0.offset) < ($1.element.word.time.start, $1.offset) }.map(\.element)
        var turns: [(speaker: Int, words: [ReRecognition.Word])] = []
        for (speaker, word) in words {
            if turns.last?.speaker == speaker { turns[turns.count - 1].words.append(word) }
            else { turns.append((speaker, [word])) }
        }
        return turns.flatMap { rows($0.words, side: .theirs, speaker: String($0.speaker)) }
    }

    private func rows(_ words: [ReRecognition.Word], side: TranscriptFormat.Segment.Side, speaker: String? = nil) -> [TranscriptFormat.Segment] {
        segments(words).map { .init(side: side, start: $0.start, settled: $0.settledText, pending: "", speaker: speaker) }
    }

    private func segments(_ words: [ReRecognition.Word]) -> [TranscriptSegment] {
        // Keep timed words at the attribution boundary and separate utterances across pauses.
        var groups: [[ReRecognition.Word]] = []
        for word in words {
            if let last = groups.last?.last, word.time.start - last.time.end <= 1 { groups[groups.count - 1].append(word) }
            else { groups.append([word]) }
        }
        return groups.enumerated().map { index, words in
            .init(id: index, start: words[0].time.start, end: words[words.count - 1].time.end,
                  words: words.map { Word($0.text, start: $0.time.start, end: $0.time.end) }, settledCount: words.count)
        }
    }

    private static func word(_ word: Word) -> ReRecognition.Word {
        .init(text: word.text, time: .init(start: word.start, end: word.end))
    }
}
