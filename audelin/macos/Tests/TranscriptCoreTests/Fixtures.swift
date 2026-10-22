import Foundation
import TranscriptCore

/// Windows recorded once from Parakeet v3 by the spike's `audelin-windows`
/// (ADR-001 invariant 14): no audio and no model in these tests.
enum Fixtures {
    static let directory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appendingPathComponent("../../../docs/research/spike/fixtures")
        .standardizedFileURL

    /// The terms recording cut into 4 s chunks with 2 s of context, its
    /// windows shifted by `shift` seconds; the last window ends the epoch.
    static func terms(shift: String) throws -> [RecognitionWindow] {
        let url = directory.appendingPathComponent("terms-shift-\(shift).jsonl")
        let lines = try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n")
        var windows = try lines.map { line in
            let raw = try JSONDecoder().decode(RawWindow.self, from: Data(line.utf8))
            return RecognitionWindow(
                start: raw.start, end: raw.end, rightContextFrom: raw.rightContextFrom,
                words: raw.words.map { Word(text: $0.w, start: $0.s, end: $0.e, confidence: $0.c) }
            )
        }
        windows[windows.count - 1].isEpochEnd = true
        return windows
    }

    private struct RawWindow: Decodable {
        var start: Double
        var end: Double
        var rightContextFrom: Double
        var words: [RawWord]
    }

    private struct RawWord: Decodable {
        var w: String
        var s: Double
        var e: Double
        var c: Double
    }
}

extension Stabilizer {
    /// Feeds every window and returns the committed words in commit order.
    mutating func run(_ windows: some Sequence<RecognitionWindow>) -> [Word] {
        windows.flatMap { feed($0)?.words ?? [] }
    }
}
