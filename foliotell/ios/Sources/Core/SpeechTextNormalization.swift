import Foundation

public enum SpeechTextNormalization {

    public static func speechText(from text: String) -> String {

        let content = text.first == "\u{feff}" ? String(text.dropFirst()) : text

        var isInsideFence = false
        var speechLines: [String] = []

        func appendCollapsingBlanks(_ line: String) {
            let isBlank = line.trimmingCharacters(in: .whitespaces).isEmpty
            if isBlank, speechLines.last?.isEmpty != false {
                return
            }
            speechLines.append(isBlank ? "" : line)
        }

        for rawLine in content.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            if line.isFenceLine {
                isInsideFence.toggle()
                continue
            }
            if isInsideFence {
                speechLines.append(line)
                continue
            }
            if line.isDelimiterOnlyLine {
                continue
            }
            appendCollapsingBlanks(
                line.strippingQuoteMarkers()
                    .strippingListMarker()
                    .strippingHeadingMarker()
                    .strippingInlineMarkers()
            )
        }

        return speechLines
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension String {

    var isFenceLine: Bool {

        let trimmed = trimmingCharacters(in: .whitespaces)
        return trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~")
    }

    var isDelimiterOnlyLine: Bool {

        let trimmed = trimmingCharacters(in: .whitespaces)
        return trimmed.range(
            of: #"^(?:-{3,}|\*{3,}|_{3,}|\.{3,})$"#,
            options: .regularExpression
        ) != nil
    }

    func strippingQuoteMarkers() -> String {

        replacingMatches(of: #"^\s*(?:>\s*)+"#, with: "")
    }

    func strippingListMarker() -> String {

        replacingMatches(of: #"^\s*(?:[-*+]|\d+[.)])\s+"#, with: "")
    }

    func strippingHeadingMarker() -> String {

        let hashes = prefix(while: { $0 == "#" })
        guard (1...6).contains(hashes.count), dropFirst(hashes.count).first == " " else {
            return self
        }

        return String(dropFirst(hashes.count + 1))
    }

    func strippingInlineMarkers() -> String {

        replacingMatches(of: #"!\[([^\]]*)\]\([^)]*\)"#, with: "$1")
            .replacingMatches(of: #"\[([^\]]*)\]\([^)]*\)"#, with: "$1")
            .replacingMatches(of: #"\*\*(?=\S)([^*]+?)(?<=\S)\*\*"#, with: "$1")
            .replacingMatches(of: #"\*(?=\S)([^*]+?)(?<=\S)\*"#, with: "$1")
            .replacingMatches(of: #"~~(?=\S)([^~]+?)(?<=\S)~~"#, with: "$1")
            .replacingMatches(of: #"(?<![\p{L}\p{N}_])__(?=\S)([^_]+?)(?<=\S)__(?![\p{L}\p{N}_])"#, with: "$1")
            .replacingMatches(of: #"(?<![\p{L}\p{N}_])_(?=\S)([^_]+?)(?<=\S)_(?![\p{L}\p{N}_])"#, with: "$1")
            .replacingMatches(of: #"`([^`]+)`"#, with: "$1")
    }

    func replacingMatches(of pattern: String, with template: String) -> String {

        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return self
        }

        return regex.stringByReplacingMatches(
            in: self,
            range: NSRange(startIndex..., in: self),
            withTemplate: template
        )
    }
}
