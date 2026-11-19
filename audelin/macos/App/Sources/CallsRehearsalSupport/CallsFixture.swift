import Foundation
import TrackFile
import TranscriptFormat

/// Calls a live test starts from, written by the app's own track and transcript writers.
public enum CallsFixture {
    /// Call ids of the merge fixture: A and B are one call cut off for nearly six minutes,
    /// C's transcript failed, so its folder holds a track and no transcript. D has a transcript
    /// and no notes: making its notes waits on the fake summary service, which keeps Audelin busy.
    public static let a = "2024.01.01-1000", b = "2024.01.01-1006", c = "2024.01.01-1012", d = "2024.01.01-1030"
    /// Each call's track length in seconds.
    public static let length: TimeInterval = 10

    /// Writes A and B with transcripts and notes, C with a track only and D with a transcript only, into `calls`.
    public static func seedMerge(in calls: URL) async throws {
        try await call(a, in: calls, words: ["Часть один.", "Ответ один."], version: "fixture-a")
        try await call(b, in: calls, words: ["Часть два.", "Ответ два."], version: "fixture-b")
        try await call(c, in: calls, words: nil)
        try await call(d, in: calls, words: ["Другой звонок.", "Ответ."], notes: false)
    }

    /// The merge fixture with A's microphone track beside its call track. The two differ, at a
    /// steady `microphoneLevel` against the call's silence, so a recogniser can tell which it heard.
    public static func seedTranscriptAgain(in calls: URL) async throws {
        try await seedMerge(in: calls)
        let track = try await TrackFile(url: calls.appendingPathComponent(a, isDirectory: true).appendingPathComponent("microphone.caf"))
        try await track.write([Float](repeating: microphoneLevel, count: Int(length * TrackFile.sampleRate)), sampleRate: TrackFile.sampleRate)
        try await track.close()
    }
    /// The level of every sample of A's microphone track in the transcript-again fixture.
    public static let microphoneLevel: Float = 0.25

    /// The merge fixture as a crash leaves a merge of A and B: the merge's prepared folder holds
    /// the joined transcript and B, moved into it; A has not moved yet.
    public static func seedInterruptedMerge(in calls: URL) async throws {
        try await seedMerge(in: calls)
        let prepared = calls.appendingPathComponent(".audelin-merge-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: prepared, withIntermediateDirectories: true)
        try Data("# Transcript\n".utf8).write(to: prepared.appendingPathComponent("transcript.md"))
        try FileManager.default.moveItem(at: calls.appendingPathComponent(b), to: prepared.appendingPathComponent(b))
    }

    /// A merge from before origins, retaining its two original folders.
    public static func seedLegacyMerge(in calls: URL) async throws {
        try await seedMerge(in: calls)
        let merged = calls.appendingPathComponent("legacy-merge")
        try FileManager.default.createDirectory(at: merged, withIntermediateDirectories: true)
        try "# Transcript\n\n**Me** 00:00:03\nLegacy merged words.\n".write(to: merged.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
        for id in [a, b] {
            try FileManager.default.moveItem(at: calls.appendingPathComponent(id), to: merged.appendingPathComponent(id))
        }
        try FileManager.default.moveItem(at: merged, to: calls.appendingPathComponent(a))
    }

    private static func call(_ id: String, in calls: URL, words: [String]?, notes: Bool = true, version: String? = nil) async throws {
        let folder = calls.appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let track = try await TrackFile(url: folder.appendingPathComponent("call.caf"))
        try await track.write([Float](repeating: 0, count: Int(length * TrackFile.sampleRate)), sampleRate: TrackFile.sampleRate)
        try await track.close()
        guard let words else { return }
        var format = TranscriptFormat()
        let speakers = [TranscriptFormat.Speaker(id: "speaker-1", name: nil, state: "unnamed"),
                        TranscriptFormat.Speaker(id: "speaker-2", name: nil, state: "unnamed")]
        let origin: TranscriptFormat.Origin? = version.map { version in
            let date = DateFormatter()
            date.locale = Locale(identifier: "en_US_POSIX"); date.timeZone = .current; date.dateFormat = "yyyy.MM.dd-HHmm"
            return .init(calls: [.init(start: date.date(from: id)!, origin: .init(
                hearing: .init(version: version, build: "fixture-build"), mine: "fixture-mine", theirs: "fixture-theirs"))])
        }
        let rendering = try format.render([
            .init(side: .mine, start: 3, settled: words[0], pending: ""),
            .init(side: .theirs, start: 10, settled: words[1], pending: "", speaker: "speaker-1"),
            .init(side: .theirs, start: 20, settled: "Да.", pending: "", speaker: "speaker-2"),
        ], speakers: speakers, origin: origin)
        try rendering.chunks.reduce(Data(), +).write(to: folder.appendingPathComponent("transcript.md"))
        guard notes else { return }
        try LiveSummaryService.notes.write(to: folder.appendingPathComponent("summary.md"), atomically: true, encoding: .utf8)
    }
}
