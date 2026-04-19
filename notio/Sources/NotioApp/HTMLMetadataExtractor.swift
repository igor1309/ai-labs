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
        guard let range = html.range(
            of: #"<title[^>]*>(.*?)</title>"#,
            options: [.regularExpression, .caseInsensitive]
        ) else { return nil }

        let match = html[range]
        guard let openEnd = match.range(of: ">"),
              let closeStart = match.range(of: "</", options: .backwards)
        else { return nil }

        let content = String(match[openEnd.upperBound..<closeStart.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return content.isEmpty ? nil : content
    }

    static func extractMetaDescription(from html: String) -> String? {
        guard let range = html.range(
            of: #"<meta\s[^>]*name\s*=\s*["']description["'][^>]*>"#,
            options: [.regularExpression, .caseInsensitive]
        ) else { return nil }

        let tag = String(html[range])
        guard let contentRange = tag.range(
            of: #"content\s*=\s*["']([^"']*)["']"#,
            options: [.regularExpression, .caseInsensitive]
        ) else { return nil }

        let contentAttr = tag[contentRange]
        guard let quoteStart = contentAttr.firstIndex(where: { $0 == "\"" || $0 == "'" }) else { return nil }
        let afterQuote = contentAttr.index(after: quoteStart)
        guard let quoteEnd = contentAttr[afterQuote...].firstIndex(where: { $0 == "\"" || $0 == "'" }) else { return nil }

        let value = String(contentAttr[afterQuote..<quoteEnd])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
