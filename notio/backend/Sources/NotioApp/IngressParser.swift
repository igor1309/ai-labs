import Foundation

public struct IngressResult: Equatable, Sendable {

    public let primaryURL: String?
    public let note: String?
}

public enum IngressParser {

    public static func parse(text: String, entities: [TelegramUpdate.Entity]?) -> IngressResult {
        guard !text.isEmpty else {
            return IngressResult(primaryURL: nil, note: nil)
        }

        let urlRanges = extractURLRanges(text: text, entities: entities)

        guard let first = urlRanges.first else {
            return IngressResult(primaryURL: nil, note: text)
        }

        let primaryURL = stripUTM(String(text[first]))
        let note = buildNote(text: text, primaryRange: first)

        return IngressResult(primaryURL: primaryURL, note: note)
    }
}

private extension IngressParser {
    static func extractURLRanges(text: String, entities: [TelegramUpdate.Entity]?) -> [Range<String.Index>] {
        if let entities, !entities.isEmpty {
            return entities
                .filter { $0.type == "url" }
                .sorted(by: { $0.offset < $1.offset })
                .compactMap { entity -> Range<String.Index>? in
                    let utf16 = text.utf16
                    guard let start = utf16.index(utf16.startIndex, offsetBy: entity.offset, limitedBy: utf16.endIndex),
                          let end = utf16.index(start, offsetBy: entity.length, limitedBy: utf16.endIndex)
                    else { return nil }
                    return start..<end
                }
        }

        var ranges: [Range<String.Index>] = []
        let pattern = try! NSRegularExpression(pattern: #"https?://\S+"#)
        let nsRange = NSRange(text.startIndex..., in: text)
        for match in pattern.matches(in: text, range: nsRange) {
            if let range = Range(match.range, in: text) {
                ranges.append(range)
            }
        }
        return ranges
    }

    static func stripUTM(_ urlString: String) -> String {
        guard var components = URLComponents(string: urlString) else { return urlString }
        if let items = components.queryItems {
            let filtered = items.filter { !$0.name.hasPrefix("utm_") }
            components.queryItems = filtered.isEmpty ? nil : filtered
        }
        return components.string ?? urlString
    }

    static func buildNote(text: String, primaryRange: Range<String.Index>) -> String? {
        var result = text
        result.removeSubrange(primaryRange)
        let collapsed = result.replacingOccurrences(of: "  ", with: " ")
        let trimmed = collapsed.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }
}
