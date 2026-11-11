import Foundation

/// Finds a query in one call's title, transcript and notes, for the calls list's search.
/// Case and ё/е are ignored; the query is matched as one phrase.
public enum CallsSearch {

    /// A transcript line: seconds from the call's start and what was said.
    public struct Line: Equatable, Sendable {
        public let start: TimeInterval
        public let words: String
        public init(start: TimeInterval, words: String) { self.start = start; self.words = words }
    }

    /// Where a call matches. Ranges are character offsets into the given title or snippet text.
    public struct Match: Equatable, Sendable {
        public let title: [Range<Int>]
        public let snippet: Snippet?
        public init(title: [Range<Int>], snippet: Snippet?) { self.title = title; self.snippet = snippet }
    }

    public struct Snippet: Equatable, Sendable {
        public enum Place: Equatable, Sendable { case transcript(TimeInterval), notes }
        public let place: Place
        /// The words around the first match, with an ellipsis where they were cut.
        public let text: String
        public let hits: [Range<Int>]
        /// Matches in the transcript and notes beyond the one shown.
        public let more: Int
        public init(place: Place, text: String, hits: [Range<Int>], more: Int) {
            self.place = place; self.text = text; self.hits = hits; self.more = more
        }
    }

    /// Characters kept before the first match in a snippet; the view truncates the rest.
    static let lead = 24
    static let tail = 120

    /// nil when the query is blank or the call does not contain it.
    public static func match(_ query: String, title: String, transcript: [Line], notes: String?) -> Match? {
        let needle = folded(query.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !needle.isEmpty else { return nil }
        let titleHits = hits(of: needle, in: Array(title))
        var places: [(Snippet.Place, [Character], [Range<Int>])] = transcript.compactMap { line in
            let text = Array(line.words)
            let found = hits(of: needle, in: text)
            return found.isEmpty ? nil : (.transcript(line.start), text, found)
        }
        if let notes {
            let text = Array(plain(notes))
            let found = hits(of: needle, in: text)
            if !found.isEmpty { places.append((.notes, text, found)) }
        }
        guard !titleHits.isEmpty || !places.isEmpty else { return nil }
        let snippet = places.first.map { place, text, found in
            cut(text, around: found, place: place, more: places.reduce(0) { $0 + $1.2.count } - 1)
        }
        return Match(title: titleHits, snippet: snippet)
    }

    private static func cut(_ text: [Character], around found: [Range<Int>], place: Snippet.Place, more: Int) -> Snippet {
        var start = max(0, found[0].lowerBound - lead)
        if start > 0 {
            // Begin at a word.
            if let space = text[start..<found[0].lowerBound].firstIndex(where: \.isWhitespace) { start = space + 1 }
        }
        var end = min(text.count, found[0].upperBound + tail)
        if end < text.count, let space = text[found[0].upperBound..<end].lastIndex(where: \.isWhitespace) { end = space }
        let prefix = start > 0 ? "…" : "", suffix = end < text.count ? "…" : ""
        let shift = prefix.count - start
        let shown = found.filter { $0.lowerBound >= start && $0.upperBound <= end }.map { ($0.lowerBound + shift)..<($0.upperBound + shift) }
        return Snippet(place: place, text: prefix + String(text[start..<end]) + suffix, hits: shown, more: more)
    }

    private static func hits(of needle: [Character], in text: [Character]) -> [Range<Int>] {
        let hay = folded(String(text))
        guard hay.count == text.count, needle.count <= hay.count else { return [] }
        var result: [Range<Int>] = [], index = 0
        while index + needle.count <= hay.count {
            if hay[index..<index + needle.count].elementsEqual(needle) {
                result.append(index..<index + needle.count)
                index += needle.count
            } else { index += 1 }
        }
        return result
    }

    /// One character in, one character out, so offsets carry over to the original text.
    private static func folded(_ text: String) -> [Character] {
        text.map { character in
            let lower = String(character).lowercased()
            guard lower.count == 1, let single = lower.first else { return character }
            return single == "ё" ? "е" : single
        }
    }

    /// Notes as running text: comment lines and Markdown marks dropped, lines joined.
    private static func plain(_ markdown: String) -> String {
        markdown.split(whereSeparator: \.isNewline)
            .filter { !$0.hasPrefix("<!--") }
            .map { $0.filter { !"*_`#>".contains($0) }.trimmingCharacters(in: .whitespaces) }
            .map { $0.hasPrefix("- ") ? String($0.dropFirst(2)) : $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}
