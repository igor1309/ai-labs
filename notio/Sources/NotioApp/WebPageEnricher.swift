import AsyncHTTPClient
import Foundation
import NIOCore

protocol HTTPFetcher: Sendable {
    func fetch(url: String, timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse
}

struct HTTPFetchResponse: Sendable {
    let status: UInt
    let body: String
}

struct WebPageEnricher: Enricher {

    private let fetcher: any HTTPFetcher
    private let timeout: TimeAmount
    private let maxBytes: Int

    init(fetcher: any HTTPFetcher, timeout: TimeAmount = .seconds(5), maxBytes: Int = 512 * 1024) {
        self.fetcher = fetcher
        self.timeout = timeout
        self.maxBytes = maxBytes
    }

    func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        let response: HTTPFetchResponse
        do {
            response = try await fetcher.fetch(url: url, timeout: timeout, maxBytes: maxBytes)
        } catch {
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        guard (200..<300).contains(response.status) else {
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        let metadata = HTMLMetadataExtractor.extract(from: response.body)
        let status: CapturedItem.Enrichment = switch (metadata.title, metadata.description) {
        case (.some, .some): .full
        case (.some, .none), (.none, .some): .partial
        case (.none, .none): .partial
        }
        return EnrichmentResult(title: metadata.title, description: metadata.description, status: status)
    }
}

struct AsyncHTTPClientFetcher: HTTPFetcher {

    private let httpClient: HTTPClient

    init(httpClient: HTTPClient) {
        self.httpClient = httpClient
    }

    func fetch(url: String, timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        var request = HTTPClientRequest(url: url)
        request.method = .GET
        let response = try await httpClient.execute(request, timeout: timeout)
        let body = try await response.body.collect(upTo: maxBytes)
        let bodyString = String(buffer: body)
        return HTTPFetchResponse(status: response.status.code, body: bodyString)
    }
}
