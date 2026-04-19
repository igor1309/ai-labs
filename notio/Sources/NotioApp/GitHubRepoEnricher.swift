import Foundation
import Logging
import NIOCore

struct GitHubRepoEnricher: Enricher {

    private let fetcher: any HTTPFetcher
    private let logger: Logger

    init(fetcher: any HTTPFetcher, logger: Logger) {
        self.fetcher = fetcher
        self.logger = logger
    }

    func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        guard let (owner, repo) = parseOwnerRepo(from: url) else {
            logger.error("enrichment: cannot parse owner/repo", metadata: ["url": .string(url)])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        let apiURL = "https://api.github.com/repos/\(owner)/\(repo)"
        let response: HTTPFetchResponse
        do {
            response = try await fetcher.fetch(url: apiURL, timeout: .seconds(5), maxBytes: 512 * 1024)
        } catch {
            logger.error("enrichment fetch failed", metadata: ["url": .string(url), "error": .string("\(error)")])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        guard (200..<300).contains(response.status) else {
            logger.error("enrichment non-2xx", metadata: ["url": .string(url), "status": .string("\(response.status)")])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        guard let data = response.body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            logger.error("enrichment: failed to decode GitHub response", metadata: ["url": .string(url)])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        let fullName = json["full_name"] as? String
        let description = json["description"] as? String
        let status: CapturedItem.Enrichment = switch (fullName, description) {
        case (.some, .some): .full
        case (.some, .none), (.none, .some): .partial
        case (.none, .none): .partial
        }
        return EnrichmentResult(title: fullName, description: description, status: status)
    }
}

private extension GitHubRepoEnricher {
    func parseOwnerRepo(from urlString: String) -> (owner: String, repo: String)? {
        guard let url = URL(string: urlString),
              url.host?.hasSuffix("github.com") == true
        else { return nil }

        let components = url.pathComponents.filter { $0 != "/" }
        guard components.count >= 2 else { return nil }
        return (components[0], components[1])
    }
}
