import Foundation

public struct Entry: Equatable, Sendable {
    public var label: String
    public var time: String
    public var text: String
    public init(label: String, time: String, text: String) { self.label = label; self.time = time; self.text = text }
}
public struct Identity: Equatable, Sendable {
    public var label: String
    public var name: String
    public var time: String
    public var quote: String
    public init(label: String, name: String, time: String, quote: String) {
        self.label = label; self.name = name; self.time = time; self.quote = quote
    }
}
public enum Failure: Error { case invalidResponse }

/// Verifies that each name is anchored in the transcript, not that it is true. A label is named by
/// its own self-introduction, or by being addressed by name in another speaker's line and answering
/// next. A label that already carries a name in parentheses keeps it; a name claimed by two labels,
/// or conflicting self-introductions, names nobody.
public struct Validator: Sendable {
    public init() {}
    public func validate(_ data: Data, entries: [Entry]) throws -> [Identity] {
        let response = try JSONDecoder().decode(Response.self, from: data)
        let labels = Set(entries.map(\.label))
        guard Set(response.speakers.map(\.label)) == labels,
              response.speakers.count == labels.count else { throw Failure.invalidResponse }
        var accepted: [Identity] = []
        for speaker in response.speakers {
            guard !speaker.label.contains("("),
                  let name = speaker.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let time = speaker.time, let quote = speaker.quote,
                  let index = entries.firstIndex(where: { $0.time == time && $0.text == quote }) else { continue }
            let said = entries[index]
            let evidence = said.label == speaker.label
                ? selfIntroduction(quote, name: name)
                : addressed(quote, name: name) && answered(after: index, by: speaker.label, entries: entries)
            guard evidence else { continue }
            // Conflicting explicit self-introductions must not be resolved by selecting one.
            let introductions = entries.filter { $0.label == speaker.label }.compactMap { introductionName($0.text) }
            guard Set(introductions.map { $0.lowercased() }).count <= 1,
                  introductions.allSatisfy({ $0.caseInsensitiveCompare(name) == .orderedSame }) else { continue }
            accepted.append(.init(label: speaker.label, name: name, time: time, quote: quote))
        }
        let counts = Dictionary(accepted.map { ($0.name.lowercased(), 1) }, uniquingKeysWith: +)
        return accepted.filter { counts[$0.name.lowercased()] == 1 }
    }
    /// The quote calls someone by the name: a word of it shares its first three letters with a
    /// word of the name, so "Андрюха" addresses Андрей. A self-introduction addresses nobody.
    private func addressed(_ quote: String, name: String) -> Bool {
        guard introductionName(quote) == nil else { return false }
        func words(_ text: String) -> [String] {
            text.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init).filter { $0.count >= 3 }
        }
        let said = words(quote)
        return words(name).contains { part in said.contains { $0.prefix(3) == part.prefix(3) } }
    }
    /// The next line by anyone other than the addresser is this label's.
    private func answered(after index: Int, by label: String, entries: [Entry]) -> Bool {
        let addresser = entries[index].label
        return entries[(index + 1)...].first(where: { $0.label != addresser })?.label == label
    }
    private func selfIntroduction(_ quote: String, name: String) -> Bool {
        introductionName(quote)?.caseInsensitiveCompare(name) == .orderedSame
    }
    private func introductionName(_ quote: String) -> String? {
        let text = quote.trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in ["My name is ", "I'm ", "I am ", "Меня зовут ", "Я — ", "Я - "] {
            guard text.lowercased().hasPrefix(prefix.lowercased()) else { continue }
            let name = String(text.dropFirst(prefix.count)).trimmingCharacters(in: CharacterSet(charactersIn: ".! "))
            // Conservative whole-utterance introductions avoid treating a mentioned name as evidence.
            guard !name.isEmpty, name.split(separator: " ").count <= 4,
                  name.unicodeScalars.allSatisfy({ CharacterSet.letters.union(.whitespaces).union(CharacterSet(charactersIn: "-'’")).contains($0) }) else { return nil }
            return name
        }
        return nil
    }
    private struct Response: Decodable { let speakers: [Speaker] }
    private struct Speaker: Decodable {
        let label: String
        let name: String?
        let time: String?
        let quote: String?
        enum CodingKeys: String, CodingKey { case label, name, time, quote }
        init(from decoder: any Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            guard [CodingKeys.label, .name, .time, .quote].allSatisfy(values.contains) else { throw Failure.invalidResponse }
            label = try values.decode(String.self, forKey: .label)
            name = try values.decodeIfPresent(String.self, forKey: .name)
            time = try values.decodeIfPresent(String.self, forKey: .time)
            quote = try values.decodeIfPresent(String.self, forKey: .quote)
            guard (name == nil && time == nil && quote == nil) || (name != nil && time != nil && quote != nil) else { throw Failure.invalidResponse }
        }
    }
}
