import Foundation

enum HTMLMetadataExtractor {

    struct Metadata: Equatable {
        let title: String?
        let description: String?
    }

    static func extract(from html: String) -> Metadata {
        Metadata(
            title: extractTitle(from: html),
            description: extractMetaDescription(from: html)
        )
    }
}

private extension HTMLMetadataExtractor {
    static func extractTitle(from html: String) -> String? {
        guard let regex = try? NSRegularExpression(
            pattern: #"<title[^>]*>([\s\S]*?)</title>"#,
            options: .caseInsensitive
        ) else { return nil }

        let nsRange = NSRange(html.startIndex..., in: html)
        guard let match = regex.firstMatch(in: html, range: nsRange),
              let contentRange = Range(match.range(at: 1), in: html)
        else { return nil }

        let raw = String(html[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        return decodeHTMLEntities(raw)
    }

    static func extractMetaDescription(from html: String) -> String? {
        guard let tagRegex = try? NSRegularExpression(
            pattern: #"<meta\s[^>]*name\s*=\s*(?:["']description["']|description(?=[\s>]))[^>]*>"#,
            options: .caseInsensitive
        ) else { return nil }

        let nsRange = NSRange(html.startIndex..., in: html)
        guard let tagMatch = tagRegex.firstMatch(in: html, range: nsRange),
              let tagRange = Range(tagMatch.range, in: html)
        else { return nil }

        let tag = String(html[tagRange])

        guard let contentRegex = try? NSRegularExpression(
            pattern: #"content\s*=\s*(["'])(.*?)\1"#,
            options: .caseInsensitive
        ) else { return nil }

        let tagNSRange = NSRange(tag.startIndex..., in: tag)
        guard let contentMatch = contentRegex.firstMatch(in: tag, range: tagNSRange),
              let valueRange = Range(contentMatch.range(at: 2), in: tag)
        else { return nil }

        let raw = String(tag[valueRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        return decodeHTMLEntities(raw)
    }

    static func decodeHTMLEntities(_ string: String) -> String {
        var result = string
        let named: [(String, String)] = [
            ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
            ("&quot;", "\""), ("&apos;", "'"), ("&#39;", "'"), ("&nbsp;", "\u{00A0}"),
        ]
        for (entity, char) in named {
            result = result.replacingOccurrences(of: entity, with: char, options: .caseInsensitive)
        }

        guard let numericRegex = try? NSRegularExpression(pattern: #"&#(?:x([0-9a-fA-F]+)|(\d+));"#, options: .caseInsensitive) else {
            return result
        }

        let matches = numericRegex.matches(in: result, range: NSRange(result.startIndex..., in: result))
        var output = ""
        var lastEnd = result.startIndex
        for match in matches {
            guard let matchRange = Range(match.range, in: result) else { continue }
            output += result[lastEnd..<matchRange.lowerBound]
            let codePoint: UInt32?
            if match.range(at: 1).location != NSNotFound,
               let hexRange = Range(match.range(at: 1), in: result) {
                codePoint = UInt32(result[hexRange], radix: 16)
            } else if match.range(at: 2).location != NSNotFound,
                      let decRange = Range(match.range(at: 2), in: result) {
                codePoint = UInt32(result[decRange])
            } else {
                codePoint = nil
            }
            if let cp = codePoint, let scalar = Unicode.Scalar(cp) {
                output += String(scalar)
            } else {
                output += result[matchRange]
            }
            lastEnd = matchRange.upperBound
        }
        output += result[lastEnd...]
        return output
    }
}
