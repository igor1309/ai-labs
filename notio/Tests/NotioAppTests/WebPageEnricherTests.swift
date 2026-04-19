import NIOCore
import Testing
@testable import NotioApp

@Suite("WebPageEnricher")
struct WebPageEnricherTests {
    @Test func test_shouldReturnFullWhenBothTitleAndDescription() async {
        let html = """
        <html><head>
        <title>Example</title>
        <meta name="description" content="A page">
        </head></html>
        """
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: html))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == "Example")
        #expect(result.description == "A page")
        #expect(result.status == .full)
    }

    @Test func test_shouldReturnPartialWhenTitleOnly() async {
        let html = "<html><head><title>Only Title</title></head></html>"
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: html))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == "Only Title")
        #expect(result.description == nil)
        #expect(result.status == .partial)
    }

    @Test func test_shouldReturnFailedOnNon2xx() async {
        let sut = makeSUT(response: HTTPFetchResponse(status: 404, body: "Not Found"))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == nil)
        #expect(result.description == nil)
        #expect(result.status == .failed)
    }

    @Test func test_shouldReturnFailedOnFetchError() async {
        let sut = makeSUT(error: StubError())

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.status == .failed)
    }

    @Test func test_shouldReturnPartialWhenNoMetadataFound() async {
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: "<html><body>No meta</body></html>"))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == nil)
        #expect(result.description == nil)
        #expect(result.status == .partial)
    }

    @Test func test_shouldPassUrlToFetcher() async {
        let spy = SpyHTTPFetcher(result: .success(HTTPFetchResponse(status: 200, body: "<title>T</title>")))
        let sut = WebPageEnricher(fetcher: spy)

        _ = await sut.enrich(url: "https://specific.example.com/page", sourceType: .webPage)

        let captured = await spy.capturedURL
        #expect(captured == "https://specific.example.com/page")
    }

    @Test func test_shouldExtractFromTruncatedOversizedResponse() async {
        let html = "<html><head><title>Truncated</title></head>" + String(repeating: "x", count: 600_000)
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: html))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == "Truncated")
        #expect(result.status == .partial)
    }
}

// MARK: - Helpers

private extension WebPageEnricherTests {
    typealias SUT = WebPageEnricher

    func makeSUT(response: HTTPFetchResponse) -> SUT {
        WebPageEnricher(fetcher: StubHTTPFetcher(result: .success(response)))
    }

    func makeSUT(error: Error) -> SUT {
        WebPageEnricher(fetcher: StubHTTPFetcher(result: .failure(error)))
    }
}

private struct StubError: Error {}

private struct StubHTTPFetcher: HTTPFetcher {
    let result: Result<HTTPFetchResponse, Error>

    func fetch(url: String, timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        try result.get()
    }
}

private actor SpyHTTPFetcher: HTTPFetcher {
    let result: Result<HTTPFetchResponse, Error>
    private(set) var capturedURL: String?

    init(result: Result<HTTPFetchResponse, Error>) {
        self.result = result
    }

    func fetch(url: String, timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        capturedURL = url
        return try result.get()
    }
}
