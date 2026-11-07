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

/// Verifies attribution and explicit self-introduction syntax, not semantic truth.
public struct Validator: Sendable {
    public init() {}
    public func validate(_ data: Data, entries: [Entry]) throws -> [Identity] {
        let response = try JSONDecoder().decode(Response.self, from: data)
        let labels = Set(entries.map(\.label))
        guard Set(response.speakers.map(\.label)) == labels,
              response.speakers.count == labels.count else { throw Failure.invalidResponse }
        var accepted: [Identity] = []
        for speaker in response.speakers {
            guard let name = speaker.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let time = speaker.time, let quote = speaker.quote,
                  entries.contains(where: { $0.label == speaker.label && $0.time == time && $0.text == quote }),
                  selfIntroduction(quote, name: name) else { continue }
            // Conflicting explicit self-introductions must not be resolved by selecting one.
            let introductions = entries.filter { $0.label == speaker.label }.compactMap { introductionName($0.text) }
            guard Set(introductions.map { $0.lowercased() }).count == 1 else { continue }
            accepted.append(.init(label: speaker.label, name: name, time: time, quote: quote))
        }
        return accepted
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
