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
    private static let header = "# Transcript\n\n"
    private var finalText = Data(header.utf8)
    private var finalCount = 0
    private var finalHasWords = false
    /// Final segments, kept to rebuild the final text when the lone remote speaker gains a second.
    private var finalSegments: [Segment] = []
    /// Whether the final text was labelled for a lone remote speaker.
    private var finalLone = false
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
        if lone != finalLone { try rebuildFinalText() }
        try renderSegments(count: count, finalCount: finalCount, segment: segment)
        let (prefix, suffix, noText) = text()
        let length = !noText && self.finalCount > 0 && speakers.isEmpty ? prefix.count : nil
        return Rendering(chunks: [prefix, suffix], finalLength: length)
    }

    private mutating func renderSegments(count: Int, finalCount: Int, segment: (Int) -> Segment) throws {

        let tailCount = max(count - self.finalCount, 0)
        for position in 0..<tailCount {
            let segment = segment(self.finalCount + position)
            let label = label(segment)
            if position < rendered.count, rendered[position].segment == segment, rendered[position].label == label { continue }
            let part = try Rendered(segment, label: label)
            if position < rendered.count { rendered[position] = part } else { rendered.append(part) }
        }
        rendered.removeLast(rendered.count - tailCount)
        let newlyFinal = min(max(finalCount - self.finalCount, 0), tailCount)
        for part in rendered.prefix(newlyFinal) { appendFinal(part) }
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

    private mutating func appendFinal(_ part: Rendered) {

        finalText.append(contentsOf: part.text.utf8)
        finalText.append(contentsOf: "\n\n".utf8)
        finalHasWords = finalHasWords || part.hasWords
        finalSegments.append(part.segment)
    }

    /// Relabels every final row; runs only when the speaker count crosses one.
    private mutating func rebuildFinalText() throws {

        let segments = finalSegments
        finalText = Data(Self.header.utf8)
        finalHasWords = false
        finalSegments = []
        for segment in segments { appendFinal(try Rendered(segment, label: label(segment))) }
        finalLone = lone
    }

    /// One listed remote speaker reads as plain `Them`, as a call without diarization does.
    private var lone: Bool { speakers.count == 1 }

    private func label(_ segment: Segment) -> String {

        Self.label(segment, speakerIDs: speakers.map(\.id))
    }

    /// A row's speaker label, shared with every other text that names speakers. A remote
    /// speaker reads as `Them N`, N being its place in the speaker list, which only grows, so
    /// N never changes. An unlisted or absent speaker, or the only listed one, reads as `Them`;
    /// the lone speaker's rows become `Them 1` when a second is listed.
    public static func label(_ segment: Segment, speakerIDs: [String]) -> String {

        guard segment.side == .theirs else { return "Me" }
        guard speakerIDs.count > 1, let id = segment.speaker, let index = speakerIDs.firstIndex(of: id) else { return "Them" }
        return "Them \(index + 1)"
    }

    /// One part read back from a rendered transcript: its label as rendered, its start
    /// in whole seconds of call time, and its words.
    public struct Entry: Sendable, Equatable {

        public let label: String
        public let start: Double
        public let words: String

        public init(label: String, start: Double, words: String) { self.label = label; self.start = start; self.words = words }
    }

    /// Reads a rendered transcript back into its parts with words, in order. A part is
    /// its header line (`**Me**`, `**Them**` or `**Them N**`, its start, and maybe the
    /// filled-in mark) and every line up to the next header or the Speakers section.
    /// Lines before the first part, and the Speakers section, are skipped.
    public static func entries(_ markdown: String) -> [Entry] {

        var entries: [Entry] = []
        var current: (label: String, start: Double, lines: [Substring])?
        func close() {
            guard let part = current else { return }
            let words = part.lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !words.isEmpty { entries.append(Entry(label: part.label, start: part.start, words: words)) }
            current = nil
        }
        let normalized = markdown.replacingOccurrences(of: "\r\n", with: "\n")
        for line in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            if let header = header(line) {
                close()
                current = (header.label, header.start, [])
            } else if line == "## Speakers" {
                close()
                break
            } else {
                current?.lines.append(line)
            }
        }
        close()
        return entries
    }

    private static func header(_ line: Substring) -> (label: String, start: Double)? {

        guard let match = line.wholeMatch(of: /\*\*(Me|Them|Them [1-9][0-9]*)\*\* ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])( \(filled in later\))?/),
              let h = Double(match.2), let m = Double(match.3), let s = Double(match.4) else { return nil }
        return (String(match.1), h * 3_600 + m * 60 + s)
    }

    /// A readable Speakers section and one versioned machine-readable block after it.
    private func speakerBlock() -> String {

        guard !speakers.isEmpty else { return "" }
        let lines = speakers.enumerated().map { "- Them\(lone ? "" : " \($0.offset + 1)"): \($0.element.name.map(Self.escaped) ?? "unknown")" }
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
        let label: String
        let text: String
        let hasWords: Bool

        init(_ segment: Segment, label side: String) throws {

            guard segment.start.isFinite, segment.start >= 0, segment.start < Double(Int.max) else {
                throw Failure.invalidStart
            }
            let seconds = Int(segment.start.rounded(.down))
            let time = String(format: "%02lld:%02lld:%02lld", seconds / 3_600, seconds / 60 % 60, seconds % 60)
            let later = segment.filledInLater ? " (filled in later)" : ""
            let words = [segment.settled, segment.pending].filter { !$0.isEmpty }.joined(separator: " ")
            self.segment = segment
            label = side
            text = "**\(side)** \(time)\(later)\n\(words)"
            hasWords = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}
