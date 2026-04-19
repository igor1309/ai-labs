import AsyncHTTPClient
import Foundation
import Logging
import NIOCore

public protocol HTTPFetcher: Sendable {
    func fetch(url: String, headers: [(String, String)], timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse
}

public struct HTTPFetchResponse: Sendable {
    public let status: UInt
    public let body: String
    public let contentType: String?

    public init(status: UInt, body: String, contentType: String? = nil) {
        self.status = status
        self.body = body
        self.contentType = contentType
    }
}

public struct WebPageEnricher: Enricher {

    private let fetcher: any HTTPFetcher
    private let logger: Logger
    private let timeout: TimeAmount
    private let maxBytes: Int

    public init(fetcher: any HTTPFetcher, logger: Logger, timeout: TimeAmount = .seconds(5), maxBytes: Int = 512 * 1024) {
        self.fetcher = fetcher
        self.logger = logger
        self.timeout = timeout
        self.maxBytes = maxBytes
    }

    public func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        let response: HTTPFetchResponse
        do {
            response = try await fetcher.fetch(url: url, headers: [], timeout: timeout, maxBytes: maxBytes)
        } catch {
            logger.error("enrichment fetch failed", metadata: ["url": .string(url), "error": .string("\(error)")])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        guard (200..<300).contains(response.status) else {
            logger.error("enrichment non-2xx", metadata: ["url": .string(url), "status": .string("\(response.status)")])
            return EnrichmentResult(title: nil, description: nil, status: .failed)
        }

        if let ct = response.contentType, !ct.contains("text/html") {
            logger.error("enrichment non-HTML content", metadata: ["url": .string(url), "content_type": .string(ct)])
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

public struct AsyncHTTPClientFetcher: HTTPFetcher {

    private let httpClient: HTTPClient

    public init(httpClient: HTTPClient) {
        self.httpClient = httpClient
    }

    public func fetch(url: String, headers: [(String, String)], timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        var currentURL = url
        let maxRedirects = 5

        for _ in 0...maxRedirects {
            var request = HTTPClientRequest(url: currentURL)
            request.method = .GET
            for (name, value) in headers {
                request.headers.add(name: name, value: value)
            }
            let response = try await httpClient.execute(request, timeout: timeout)

            let status = response.status.code
            if (300..<400).contains(status), let location = response.headers.first(name: "location") {
                currentURL = resolveRedirect(location, relativeTo: currentURL)
                continue
            }

            var accumulated = ByteBuffer()
            for try await var chunk in response.body {
                let remaining = maxBytes - accumulated.readableBytes
                if remaining <= 0 { break }
                if chunk.readableBytes > remaining {
                    chunk = chunk.getSlice(at: chunk.readerIndex, length: remaining) ?? chunk
                }
                accumulated.writeBuffer(&chunk)
            }
            let bodyString = String(buffer: accumulated)
            let contentType = response.headers.first(name: "content-type")
            return HTTPFetchResponse(status: status, body: bodyString, contentType: contentType)
        }

        return HTTPFetchResponse(status: 301, body: "", contentType: nil)
    }

    private func resolveRedirect(_ location: String, relativeTo base: String) -> String {
        if location.hasPrefix("http://") || location.hasPrefix("https://") {
            return location
        }
        guard let baseURL = URL(string: base),
              let resolved = URL(string: location, relativeTo: baseURL)
        else { return location }
        return resolved.absoluteString
    }
}
