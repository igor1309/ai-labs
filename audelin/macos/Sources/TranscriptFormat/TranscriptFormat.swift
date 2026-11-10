import Foundation

/// The transcript's Markdown writer. A value keeps its final rows across renderings;
/// construct a fresh value to render a replacement from nothing.
public struct TranscriptFormat: Sendable {

    public enum Failure: Error, Equatable { case invalidStart }

    /// Words from one side, starting at a time in seconds from the call's beginning.
    public struct Segment: Sendable, Equatable {

        public enum Side: Sendable {

            case mine, theirs
        }

        public let side: Side
        public let start: Double
        public let settled: String
        public let pending: String
        public let filledInLater: Bool
        /// The diarized speaker's stable generic ID on the other side; never a name, so a
        /// final row never needs rewriting when names change.
        public let speaker: String?

        public init(side: Side, start: Double, settled: String, pending: String, filledInLater: Bool = false, speaker: String? = nil) {

            self.side = side
            self.speaker = speaker
            self.start = start
            self.settled = settled
            self.pending = pending
            self.filledInLater = filledInLater
        }
    }

    /// One remote speaker's current name, revised as evidence changes.
    public struct Speaker: Sendable, Equatable, Codable {

        public let id: String
        public let name: String?
        public let state: String

        public init(id: String, name: String?, state: String) { self.id = id; self.name = name; self.state = state }
    }

    /// Separate byte chunks avoid copying the final prefix into every new rendering.
    public struct Rendering: Sendable {

        public let chunks: [Data]
        /// Immutable leading bytes, absent for no text or a speaker-name block.
        public let finalLength: Int?
    }

    /// Every entry from `finalCount` on, kept so an unchanged one is not rendered again.
    private var rendered: [Rendered] = []
    /// The header and each final entry followed by its separator; only ever appended to.
    private var finalText = Data("# Transcript\n\n".utf8)
    private var finalCount = 0
    private var finalHasWords = false
    private var speakers: [Speaker] = []
    private var revision = 0
    private static let noText = "# Transcript\n\nNo text was heard.\n"

    public init() {}

    public mutating func render(_ segments: [Segment], speakers: [Speaker] = []) throws -> Rendering {

        try render(count: segments.count, finalCount: 0, speakers: speakers) { segments[$0] }
    }

    /// Asks only for entries after those already final. Final entries must never change.
    public mutating func render(count: Int, finalCount: Int, speakers: [Speaker] = [], segment: (Int) -> Segment) throws -> Rendering {

        self.speakers = speakers
        revision += 1
        try renderSegments(count: count, finalCount: finalCount, segment: segment)
        let (prefix, suffix, noText) = text()
        let length = !noText && self.finalCount > 0 && speakers.isEmpty ? prefix.count : nil
        return Rendering(chunks: [prefix, suffix], finalLength: length)
    }

    private mutating func renderSegments(count: Int, finalCount: Int, segment: (Int) -> Segment) throws {

        let tailCount = max(count - self.finalCount, 0)
        for position in 0..<tailCount {
            let segment = segment(self.finalCount + position)
            if position < rendered.count, rendered[position].segment == segment { continue }
            let part = try Rendered(segment)
            if position < rendered.count { rendered[position] = part } else { rendered.append(part) }
        }
        rendered.removeLast(rendered.count - tailCount)
        let newlyFinal = min(max(finalCount - self.finalCount, 0), tailCount)
        for part in rendered.prefix(newlyFinal) {
            finalText.append(contentsOf: part.text.utf8)
            finalText.append(contentsOf: "\n\n".utf8)
            finalHasWords = finalHasWords || part.hasWords
        }
        rendered.removeFirst(newlyFinal)
        self.finalCount += newlyFinal
    }

    /// The rendering's two parts, so the final text is never copied into a new string.
    private func text() -> (final: Data, tail: Data, noText: Bool) {

        guard finalHasWords || rendered.contains(where: \.hasWords) else { return (Data(Self.noText.utf8), Data(), true) }
        let block = speakerBlock()
        if rendered.isEmpty { return block.isEmpty ? (finalText.dropLast(), Data(), false) : (finalText, Data(block.utf8), false) }
        let rows = rendered.lazy.map(\.text).joined(separator: "\n\n") + "\n"
        return (finalText, Data((block.isEmpty ? rows : rows + "\n" + block).utf8), false)
    }

    /// A readable Speakers section and one versioned machine-readable block after it.
    private func speakerBlock() -> String {

        guard !speakers.isEmpty else { return "" }
        let lines = speakers.map { "- Speaker \(Self.escaped($0.id)): \($0.name.map(Self.escaped) ?? "unknown")" }
        struct Metadata: Encodable { let schemaVersion = 1; let revision: Int; let speakers: [Speaker] }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let json = (try? encoder.encode(Metadata(revision: revision, speakers: speakers))).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
        // `>` only ever appears inside JSON strings, so escaping it keeps the comment closed.
        let safe = json.replacingOccurrences(of: ">", with: "\\u003e")
        return "## Speakers\n\n" + lines.joined(separator: "\n") + "\n\n<!-- audelin-speakers \(safe) -->\n"
    }

    static func escaped(_ text: String) -> String {

        var out = ""
        for character in text {
            if character.isNewline { out.append(" "); continue }
            if "\\`*_[]<>#|".contains(character) { out.append("\\") }
            out.append(character)
        }
        return out
    }

    /// One segment's text, kept so an unchanged segment is not rendered again.
    private struct Rendered {

        let segment: Segment
        let text: String
        let hasWords: Bool

        init(_ segment: Segment) throws {

            guard segment.start.isFinite, segment.start >= 0, segment.start < Double(Int.max) else {
                throw Failure.invalidStart
            }
            let seconds = Int(segment.start.rounded(.down))
            let time = String(format: "%02lld:%02lld:%02lld", seconds / 3_600, seconds / 60 % 60, seconds % 60)
            let side = segment.side == .mine ? "Me" : segment.speaker.map { "Speaker \(TranscriptFormat.escaped($0))" } ?? "Them"
            let later = segment.filledInLater ? " (filled in later)" : ""
            let words = [segment.settled, segment.pending].filter { !$0.isEmpty }.joined(separator: " ")
            self.segment = segment
            text = "**\(side)** \(time)\(later)\n\(words)"
            hasWords = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}
