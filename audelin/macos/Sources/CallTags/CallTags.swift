import Foundation


/// The rules for a call's tags: when two tags are one, how a query names tags,
/// which calls a chosen set of tags keeps, and which tags are in use.
/// Case and ё/е are ignored; a tag is shown as first written.
public enum CallTags {

    /// The form two tags are compared in: lower case, ё as е.
    public static func key(_ tag: String) -> String {
        String(tag.lowercased().map { $0 == "ё" ? "е" : $0 })
    }

    /// Trimmed, empty ones dropped, and each tag once, kept as first written.
    public static func normalized(_ tags: [String]) -> [String] {
        var seen = Set<String>()
        return tags.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert(key($0)).inserted }
    }

    /// A search query split into the tags named as `#tag` words and the remaining text.
    public struct Query: Equatable, Sendable {
        public let tags: [String]
        public let text: String
        public init(tags: [String], text: String) { self.tags = tags; self.text = text }
    }

    public static func query(_ query: String) -> Query {
        var tags: [String] = [], words: [Substring] = []
        for word in query.split(whereSeparator: \.isWhitespace) {
            if word.hasPrefix("#"), word.count > 1 { tags.append(String(word.dropFirst())) } else { words.append(word) }
        }
        return Query(tags: normalized(tags), text: words.joined(separator: " "))
    }

    /// The calls having every chosen tag, in their order; all of them when none is chosen.
    public static func keep<Call>(_ calls: [Call], having chosen: [String], tags: (Call) -> [String]) -> [Call] {
        let wanted = Set(chosen.map(key))
        guard !wanted.isEmpty else { return calls }
        return calls.filter { wanted.isSubset(of: Set(tags($0).map(key))) }
    }

    /// Every tag on the given calls, most used first; ties keep the order first met.
    public static func inUse(_ callsTags: [[String]]) -> [String] {
        var order: [String] = [], shown: [String: String] = [:], count: [String: Int] = [:]
        for tags in callsTags {
            for tag in normalized(tags) {
                let k = key(tag)
                if shown[k] == nil { shown[k] = tag; order.append(k) }
                count[k, default: 0] += 1
            }
        }
        return order.enumerated()
            .sorted { (count[$0.element]!, -$0.offset) > (count[$1.element]!, -$1.offset) }
            .map { shown[$0.element]! }
    }

    /// The rest of the first tag in use that the entry starts and the draft lacks; empty when none.
    public static func completion(of entry: String, draft: [String], inUse: [String]) -> String {
        let typed = key(entry)
        guard !typed.isEmpty else { return "" }
        let taken = Set(draft.map(key))
        let tag = inUse.first {
            let k = key($0)
            return k.hasPrefix(typed) && k != typed && !taken.contains(k)
        }
        return tag.map { String($0.dropFirst(entry.count)) } ?? ""
    }
}
