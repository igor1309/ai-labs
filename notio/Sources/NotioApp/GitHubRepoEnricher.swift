import Foundation
import Logging
import NIOCore

public struct GitHubRepoEnricher: Enricher {

    private let fetcher: any HTTPFetcher
    private let logger: Logger

    public init(fetcher: any HTTPFetcher, logger: Logger) {
        self.fetcher = fetcher
        self.logger = logger
    }

    public func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        guard let (owner, repo) = parseOwnerRepo(from: url) else {
            logger.error("enrichment: cannot parse owner/repo", metadata: ["url": .string(url)])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        let apiURL = "https://api.github.com/repos/\(owner)/\(repo)"
        let response: HTTPFetchResponse
        do {
            let headers = [
                ("User-Agent", "notio"),
                ("Accept", "application/vnd.github+json"),
            ]
            response = try await fetcher.fetch(url: apiURL, headers: headers, timeout: .seconds(5), maxBytes: 512 * 1024)
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

        guard let fullName = json["full_name"] as? String else {
            logger.error("enrichment: missing full_name in GitHub response", metadata: ["url": .string(url)])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        let description = json["description"] as? String
        let status: CapturedItem.Enrichment = description != nil ? .full : .partial
        return EnrichmentResult(title: fullName, description: description, status: status)
    }
}

private extension GitHubRepoEnricher {
    func parseOwnerRepo(from urlString: String) -> (owner: String, repo: String)? {
        guard let url = URL(string: urlString),
              let host = url.host,
              host == "github.com" || host == "www.github.com"
        else { return nil }

        let components = url.pathComponents.filter { $0 != "/" }
        guard components.count >= 2 else { return nil }
        let repo = components[1].hasSuffix(".git") ? String(components[1].dropLast(4)) : components[1]
        return (components[0], repo)
    }
}
