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

        let content = String(html[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        return content.isEmpty ? nil : content
    }

    static func extractMetaDescription(from html: String) -> String? {
        guard let tagRegex = try? NSRegularExpression(
            pattern: #"<meta\s[^>]*name\s*=\s*["']description["'][^>]*>"#,
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

        let value = String(tag[valueRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
