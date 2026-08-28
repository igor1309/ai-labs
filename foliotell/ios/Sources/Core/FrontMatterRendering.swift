public struct FrontMatterRendering: Equatable, Sendable {
    public let frontMatter: String?
    public let body: String

    public init(frontMatter: String?, body: String) {
        self.frontMatter = frontMatter
        self.body = body
    }

    public static func renderableText(from text: String) -> FrontMatterRendering {

        let frontMatterCandidate = text.first == "\u{feff}" ? text.dropFirst() : text[...]
        guard frontMatterCandidate.hasPrefix("---") else {
            return FrontMatterRendering(frontMatter: nil, body: text)
        }

        let lines = frontMatterCandidate.split(separator: "\n", omittingEmptySubsequences: false)
        guard lines.first == "---" else {
            return FrontMatterRendering(frontMatter: nil, body: text)
        }

        guard let closingIndex = lines.dropFirst().firstIndex(where: { $0 == "---" || $0 == "..." }) else {
            return FrontMatterRendering(frontMatter: nil, body: text)
        }

        let bodyStartIndex = lines.index(after: closingIndex)
        return FrontMatterRendering(
            frontMatter: lines[...closingIndex].joined(separator: "\n"),
            body: lines[bodyStartIndex...].joined(separator: "\n")
        )
    }
}
