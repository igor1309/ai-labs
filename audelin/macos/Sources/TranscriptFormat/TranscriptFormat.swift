import Foundation

/// The transcript's Markdown writer. A value keeps its final rows across renderings;
/// construct a fresh value to render a replacement from nothing.
public struct TranscriptFormat: Sendable {

    public enum Failure: Error, Equatable { case invalidStart, invalidGap }

    /// Words from one side, starting at a time in seconds from the call's beginning.
    public struct Segment: Sendable, Equatable {

        public enum Side: Sendable {

            case mine, theirs
            /// Where the call was cut off: a row with no side and no words.
            case gap
        }

        public let side: Side
        public let start: Double
        public let settled: String
        public let pending: String
        public let filledInLater: Bool
        /// The diarized speaker's stable generic ID on the other side; never a name, so a
        /// final row never needs rewriting when names change.
        public let speaker: String?
        /// How long a gap row says the call was cut off, in seconds; none for words.
        public let gapLength: Double?

        public init(side: Side, start: Double, settled: String, pending: String, filledInLater: Bool = false, speaker: String? = nil) {

            self.side = side
            self.speaker = speaker
            self.start = start
            self.settled = settled
            self.pending = pending
            self.filledInLater = filledInLater
            gapLength = nil
        }

        /// A row saying the call was cut off at `start` for `length` seconds.
        public static func gap(at start: Double, length: Double) -> Segment { Segment(gapAt: start, length: length) }

        private init(gapAt start: Double, length: Double) {

            side = .gap
            self.start = start
            settled = ""
            pending = ""
            filledInLater = false
            speaker = nil
            gapLength = length
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
        /// Immutable leading bytes, including origin; absent for no text, names or a changed origin.
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
    /// The sole remote ID used to label the cached final text.
    private var finalLoneSpeakerID: String?
    private var speakers: [Speaker] = []
    private var revision = 0
    private static let noText = "# Transcript\n\nNo text was heard.\n"

    private var previousOrigin: Origin?
    private var hasRendered = false

    public init() {}

    public mutating func render(_ segments: [Segment], speakers: [Speaker] = [], origin: Origin? = nil) throws -> Rendering {

        try render(count: segments.count, finalCount: 0, speakers: speakers, origin: origin) { segments[$0] }
    }

    /// Asks only for entries after those already final. Final entries must never change.
    public mutating func render(count: Int, finalCount: Int, speakers: [Speaker] = [], segment: (Int) -> Segment) throws -> Rendering {

        try render(count: count, finalCount: finalCount, speakers: speakers, origin: nil, segment: segment)
    }

    /// A changed origin invalidates the file's retained prefix, even when its byte count is unchanged.
    public mutating func render(count: Int, finalCount: Int, speakers: [Speaker] = [], origin: Origin?, segment: (Int) -> Segment) throws -> Rendering {

        let frontMatter = try Self.frontMatter(origin)
        let originChanged = hasRendered && previousOrigin != origin
        self.speakers = speakers
        revision += 1
        if loneSpeakerID != finalLoneSpeakerID { try rebuildFinalText() }
        try renderSegments(count: count, finalCount: finalCount, segment: segment)
        let (prefix, suffix, noText) = text()
        let length = !noText && self.finalCount > 0 && speakers.isEmpty && !originChanged ? frontMatter.count + prefix.count : nil
        previousOrigin = origin
        hasRendered = true
        return Rendering(chunks: [frontMatter, prefix, suffix], finalLength: length)
    }

    private mutating func renderSegments(count: Int, finalCount: Int, segment: (Int) -> Segment) throws {

        let tailCount = max(count - self.finalCount, 0)
        for position in 0..<tailCount {
            let segment = segment(self.finalCount + position)
            let label = label(segment)
            let unattributed = isUnattributedWithLoneSpeaker(segment)
            if position < rendered.count, rendered[position].segment == segment, rendered[position].label == label,
               rendered[position].unattributed == unattributed { continue }
            let part = try Rendered(segment, label: label, unattributed: unattributed)
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
        for segment in segments {
            appendFinal(try Rendered(segment, label: label(segment), unattributed: isUnattributedWithLoneSpeaker(segment)))
        }
        finalLoneSpeakerID = loneSpeakerID
    }

    /// One listed remote speaker reads as plain `Them`, as a call without diarization does.
    private var loneSpeakerID: String? { speakers.count == 1 ? speakers.first?.id : nil }

    private func label(_ segment: Segment) -> String {

        Self.label(segment, speakerIDs: speakers.map(\.id))
    }

    private func isUnattributedWithLoneSpeaker(_ segment: Segment) -> Bool {
        guard segment.side == .theirs, let loneSpeakerID else { return false }
        return segment.speaker != loneSpeakerID
    }

    /// A row's label for notes: the speaker label, followed by the speaker's name in
    /// parentheses when the transcript has one, as in `Them 1 (Анна)`.
    public static func namedLabel(_ segment: Segment, speakers: [Speaker]) -> String {

        let label = label(segment, speakerIDs: speakers.map(\.id))
        guard segment.side == .theirs, let id = segment.speaker,
              let name = speakers.first(where: { $0.id == id })?.name?.trimmingCharacters(in: .whitespacesAndNewlines),
              !name.isEmpty else { return label }
        return "\(label) (\(name))"
    }

    /// A saved transcript's parts with words, each labelled with its speaker's name as `namedLabel` does.
    public static func namedEntries(_ markdown: String) -> [Entry] {

        let (parts, speakers, _) = parts(markdown)
        return parts.filter { $0.gap == nil }.map { part in
            let name = part.speaker(in: speakers)?.name?.trimmingCharacters(in: .whitespacesAndNewlines)
            let label = name.map { $0.isEmpty ? part.label : "\(part.label) (\($0))" } ?? part.label
            return Entry(label: label, start: part.start, words: part.words)
        }
    }

    /// A row's speaker label, shared with every other text that names speakers. A remote
    /// speaker reads as `Them N`, N being its place in the speaker list, which only grows, so
    /// N never changes. An unlisted or absent speaker, or the only listed one, reads as `Them`;
    /// the lone speaker's rows become `Them 1` when a second is listed.
    public static func label(_ segment: Segment, speakerIDs: [String]) -> String {

        if segment.side == .gap { return "Gap" }
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

        parts(markdown).parts.filter { $0.gap == nil }.map { Entry(label: $0.label, start: $0.start, words: $0.words) }
    }

    /// A saved transcript read back as fully as it was rendered: each part with words and
    /// the speakers' current names, so rendering it again gives the same transcript.
    public struct Saved: Sendable, Equatable {

        public let segments: [Segment]
        public let speakers: [Speaker]
        public let origin: Origin?

        public init(segments: [Segment], speakers: [Speaker], origin: Origin? = nil) {
            self.segments = segments; self.speakers = speakers; self.origin = origin
        }
    }

    /// Reads back what rendering needs to render a saved transcript again. A `Them N`
    /// row is given the Nth listed speaker's ID. A plain `Them` row has the sole
    /// listed speaker's ID unless the header marks it as unattributed.
    /// Words come back settled, as final text was rendered.
    public static func read(_ markdown: String) -> Saved {

        let (parts, speakers, origin) = parts(markdown)
        let segments = parts.map { part -> Segment in
            if let length = part.gap { return .gap(at: part.start, length: length) }
            guard part.label != "Me" else {
                return Segment(side: .mine, start: part.start, settled: part.words, pending: "", filledInLater: part.later)
            }
            return Segment(side: .theirs, start: part.start, settled: part.words, pending: "",
                           filledInLater: part.later, speaker: part.speaker(in: speakers)?.id)
        }
        return Saved(segments: segments, speakers: speakers, origin: origin)
    }

    private struct Part {
        let label: String
        let start: Double
        let later: Bool
        let words: String
        var gap: Double? = nil
        var unattributed = false

        func speaker(in speakers: [Speaker]) -> Speaker? {
            if label == "Them" { return !unattributed && speakers.count == 1 ? speakers.first : nil }
            guard label.hasPrefix("Them "), let number = Int(label.dropFirst("Them ".count)),
                  speakers.indices.contains(number - 1) else { return nil }
            return speakers[number - 1]
        }
    }

    private static func parts(_ markdown: String) -> (parts: [Part], speakers: [Speaker], origin: Origin?) {

        var parts: [Part] = []
        var speakers: [Speaker] = []
        var current: (header: Header, lines: [Substring])?
        func close() {
            guard let part = current else { return }
            let words = part.lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            let header = part.header
            if header.label == "Gap" {
                if let length = gapLength(words) { parts.append(Part(label: "Gap", start: header.start, later: false, words: "", gap: length)) }
            } else if !words.isEmpty {
                parts.append(Part(label: header.label, start: header.start, later: header.later, words: words,
                                  unattributed: header.unattributed))
            }
            current = nil
        }
        let (normalized, origin) = frontMatter(markdown)
        var inSpeakers = false
        for line in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            if inSpeakers {
                if let block = speakerList(line) { speakers = block }
            } else if let header = header(line) {
                close()
                current = (header, [])
            } else if line == "## Speakers" {
                close()
                inSpeakers = true
            } else {
                current?.lines.append(line)
            }
        }
        close()
        return (parts, speakers, origin)
    }

    /// A gap row's text, `Cut off for HH:MM:SS.`, read back as seconds.
    private static func gapLength(_ text: String) -> Double? {

        guard let match = text.wholeMatch(of: /Cut off for ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])\./),
              let h = Double(match.1), let m = Double(match.2), let s = Double(match.3) else { return nil }
        return h * 3_600 + m * 60 + s
    }

    private static func clock(_ seconds: Int) -> String {

        String(format: "%02lld:%02lld:%02lld", seconds / 3_600, seconds / 60 % 60, seconds % 60)
    }

    private static func speakerList(_ line: Substring) -> [Speaker]? {

        let prefix = "<!-- audelin-speakers ", suffix = " -->"
        guard line.hasPrefix(prefix), line.hasSuffix(suffix) else { return nil }
        struct Metadata: Decodable { let speakers: [Speaker] }
        let json = line.dropFirst(prefix.count).dropLast(suffix.count)
        return try? JSONDecoder().decode(Metadata.self, from: Data(json.utf8)).speakers
    }

    private typealias Header = (label: String, start: Double, later: Bool, unattributed: Bool)
    private static let unattributedMarker = " <!-- audelin-unattributed -->"

    private static func header(_ line: Substring) -> Header? {

        let marked = line.hasSuffix(unattributedMarker)
        let visible = marked ? line.dropLast(unattributedMarker.count) : line
        guard let match = visible.wholeMatch(of: /\*\*(Me|Them|Them [1-9][0-9]*|Gap)\*\* ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])( \(filled in later\))?/),
              let h = Double(match.2), let m = Double(match.3), let s = Double(match.4) else { return nil }
        return (String(match.1), h * 3_600 + m * 60 + s, match.5 != nil, marked)
    }

    /// A readable Speakers section and one versioned machine-readable block after it.
    private func speakerBlock() -> String {

        guard !speakers.isEmpty else { return "" }
        let lines = speakers.enumerated().map { "- Them\(loneSpeakerID != nil ? "" : " \($0.offset + 1)"): \($0.element.name.map(Self.escaped) ?? "unknown")" }
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
        let unattributed: Bool

        init(_ segment: Segment, label side: String, unattributed: Bool) throws {

            guard segment.start.isFinite, segment.start >= 0, segment.start < Double(Int.max) else {
                throw Failure.invalidStart
            }
            let time = TranscriptFormat.clock(Int(segment.start.rounded(.down)))
            self.segment = segment
            label = side
            self.unattributed = unattributed
            if let length = segment.gapLength {
                guard length.isFinite, length >= 0, length < Double(Int.max) else { throw Failure.invalidGap }
                text = "**Gap** \(time)\nCut off for \(TranscriptFormat.clock(Int(length.rounded(.down))))."
                hasWords = false
                return
            }
            let later = segment.filledInLater ? " (filled in later)" : ""
            let words = [segment.settled, segment.pending].filter { !$0.isEmpty }.joined(separator: " ")
            let marker = unattributed ? TranscriptFormat.unattributedMarker : ""
            text = "**\(side)** \(time)\(later)\(marker)\n\(words)"
            hasWords = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}
