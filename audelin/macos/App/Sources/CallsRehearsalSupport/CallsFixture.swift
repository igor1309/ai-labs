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
        try await call(a, in: calls, words: ["Часть один.", "Ответ один."])
        try await call(b, in: calls, words: ["Часть два.", "Ответ два."])
        try await call(c, in: calls, words: nil)
        try await call(d, in: calls, words: ["Другой звонок.", "Ответ."], notes: false)
    }

    private static func call(_ id: String, in calls: URL, words: [String]?, notes: Bool = true) async throws {
        let folder = calls.appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let track = try await TrackFile(url: folder.appendingPathComponent("call.caf"))
        try await track.write([Float](repeating: 0, count: Int(length * TrackFile.sampleRate)), sampleRate: TrackFile.sampleRate)
        try await track.close()
        guard let words else { return }
        var format = TranscriptFormat()
        let speakers = [TranscriptFormat.Speaker(id: "speaker-1", name: nil, state: "unnamed"),
                        TranscriptFormat.Speaker(id: "speaker-2", name: nil, state: "unnamed")]
        let rendering = try format.render([
            .init(side: .mine, start: 3, settled: words[0], pending: ""),
            .init(side: .theirs, start: 10, settled: words[1], pending: "", speaker: "speaker-1"),
            .init(side: .theirs, start: 20, settled: "Да.", pending: "", speaker: "speaker-2"),
        ], speakers: speakers)
        try rendering.chunks.reduce(Data(), +).write(to: folder.appendingPathComponent("transcript.md"))
        guard notes else { return }
        try LiveSummaryService.notes.write(to: folder.appendingPathComponent("summary.md"), atomically: true, encoding: .utf8)
    }
}
