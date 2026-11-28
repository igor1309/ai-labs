import Foundation

public protocol SplitPointEntry {
    /// Whole seconds from the transcript's start.
    var start: Int { get }
    /// Gap markers have no words.
    var words: String? { get }
}

public enum SplitPoints {

    public struct Choice<Entry: SplitPointEntry> {
        public let before: Entry
        public let after: Entry
        public let cut: Int
        public let gap: Int
        public let suggestsTransition: Bool
        public let secondPartMinute: Date
    }

    /// Ranks boundaries by distance between spoken starts, with earlier cuts first on ties.
    public static func choices<Entry: SplitPointEntry>(for entries: [Entry], timelineStart: Date) -> [Choice<Entry>] {
        let spoken = entries.enumerated().filter { _, entry in
            entry.start >= 0 && entry.words?.contains(where: { !$0.isWhitespace }) == true
        }.sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }.map(\.element)

        return zip(spoken, spoken.dropFirst()).compactMap { before, after in
            guard before.start < after.start else { return nil }
            let timestamp = timelineStart.timeIntervalSince1970 + Double(after.start)
            return Choice(before: before, after: after, cut: after.start, gap: after.start - before.start,
                          suggestsTransition: matches(before.words, endings) || matches(after.words, beginnings),
                          secondPartMinute: Date(timeIntervalSince1970: (timestamp / 60).rounded(.down) * 60))
        }.sorted { (-$0.gap, $0.cut) < (-$1.gap, $1.cut) }
    }

    private static let endings = [
        "всем пока", "до встречи", "до завтра", "спасибо всем", "спасибо за встречу",
        "thanks everyone", "thank you all", "thanks for joining", "see you tomorrow", "see you next time", "goodbye",
    ]

    private static let beginnings = [
        "всем привет", "добрый день", "доброе утро", "давайте начнем", "начинаем",
        "hello everyone", "good morning", "let s get started", "let s begin", "welcome everyone",
    ]

    private static func matches(_ words: String?, _ phrases: [String]) -> Bool {
        guard let words else { return false }
        let normalized = words.lowercased().replacingOccurrences(of: "ё", with: "е")
        let tokens = normalized.split { !$0.isLetter && !$0.isNumber }
        let text = " " + tokens.joined(separator: " ") + " "
        return phrases.contains { text.contains(" " + $0 + " ") }
    }
}
