public enum FrontMatterPlaybackMode: String, CaseIterable, Equatable, Identifiable, Sendable {
    case skip
    case read

    public var id: String {
        rawValue
    }

    public var title: String {
        switch self {
        case .skip:
            "Skip"
        case .read:
            "Read"
        }
    }

    public static func mode(for rawValue: String) -> FrontMatterPlaybackMode {
        FrontMatterPlaybackMode(rawValue: rawValue) ?? .skip
    }

    public func speechText(from text: String) -> String {
        switch self {
        case .read:
            text
        case .skip:
            text.removingLeadingYAMLFrontMatter()
        }
    }
}

private extension String {

    func removingLeadingYAMLFrontMatter() -> String {
        let frontMatterCandidate = first == "\u{feff}" ? dropFirst() : self[...]
        guard frontMatterCandidate.hasPrefix("---") else {
            return self
        }

        let lines = frontMatterCandidate.split(separator: "\n", omittingEmptySubsequences: false)
        guard lines.first == "---" else {
            return self
        }

        guard let closingIndex = lines.dropFirst().firstIndex(where: { $0 == "---" || $0 == "..." }) else {
            return self
        }

        let bodyStartIndex = lines.index(after: closingIndex)
        return lines[bodyStartIndex...].joined(separator: "\n")
    }
}
