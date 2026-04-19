import Foundation

public struct CapturedItem: Equatable, Sendable {

    public let kind: Kind
    public let sourceType: SourceType?
    public let capturedAt: Date
    public let url: String?
    public let note: String?
    public let enrichment: Enrichment
    public let capturedTitle: String?
    public let capturedDescription: String?

    public enum Kind: String, Equatable, Sendable {
        case note
        case link
    }

    public enum SourceType: String, Equatable, Sendable {
        case githubRepo = "github_repo"
        case webPage = "web_page"
    }

    public enum Enrichment: String, Equatable, Sendable {
        case full, partial, failed, none
    }

    public init(from result: IngressResult) {
        self.capturedAt = Date()
        self.url = result.primaryURL
        self.note = result.note
        self.enrichment = .none
        self.capturedTitle = nil
        self.capturedDescription = nil

        if let url = result.primaryURL {
            self.kind = .link
            self.sourceType = Self.classifySource(url)
        } else {
            self.kind = .note
            self.sourceType = nil
        }
    }
}

private extension CapturedItem {
    static func classifySource(_ urlString: String) -> SourceType {
        guard let url = URL(string: urlString),
              url.host?.hasSuffix("github.com") == true
        else { return .webPage }

        let pathComponents = url.pathComponents.filter { $0 != "/" }
        if pathComponents.count == 2 {
            return .githubRepo
        }
        return .webPage
    }
}
