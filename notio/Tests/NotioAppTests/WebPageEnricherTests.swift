import Logging
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
        let sut = WebPageEnricher(fetcher: spy, logger: noopLogger)

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

    @Test func test_shouldReturnPartialForNonHTMLContentType() async {
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: "%PDF-1.4", contentType: "application/pdf"))

        let result = await sut.enrich(url: "https://example.com/file.pdf", sourceType: .webPage)

        #expect(result.status == .partial)
        #expect(result.title == nil)
    }

    @Test func test_shouldAcceptHTMLContentType() async {
        let html = "<html><head><title>Page</title></head></html>"
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: html, contentType: "text/html; charset=utf-8"))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == "Page")
        #expect(result.status == .partial)
    }

    @Test func test_shouldAcceptMixedCaseHTMLContentType() async {
        let html = "<html><head><title>Page</title></head></html>"
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: html, contentType: "TEXT/HTML; charset=UTF-8"))

        let result = await sut.enrich(url: "https://example.com", sourceType: .webPage)

        #expect(result.title == "Page")
    }

    @Test func test_shouldLogOnFetchError() async {
        let handler = SpyLogHandler()
        let sut = WebPageEnricher(
            fetcher: StubHTTPFetcher(result: .failure(StubError())),
            logger: Logger(label: "test", factory: { _ in handler })
        )

        _ = await sut.enrich(url: "https://fail.example.com", sourceType: .webPage)

        let messages = handler.messages
        #expect(messages.map(\.level) == [.error])
        #expect(messages.first?.metadata?["url"] == "https://fail.example.com")
    }

    @Test func test_shouldLogOnNon2xxResponse() async {
        let handler = SpyLogHandler()
        let sut = WebPageEnricher(
            fetcher: StubHTTPFetcher(result: .success(HTTPFetchResponse(status: 500, body: ""))),
            logger: Logger(label: "test", factory: { _ in handler })
        )

        _ = await sut.enrich(url: "https://error.example.com", sourceType: .webPage)

        let messages = handler.messages
        #expect(messages.map(\.level) == [.error])
        #expect(messages.first?.metadata?["url"] == "https://error.example.com")
    }
}

// MARK: - Helpers

private extension WebPageEnricherTests {
    typealias SUT = WebPageEnricher

    var noopLogger: Logger { Logger(label: "test", factory: SwiftLogNoOpLogHandler.init) }

    func makeSUT(response: HTTPFetchResponse) -> SUT {
        WebPageEnricher(fetcher: StubHTTPFetcher(result: .success(response)), logger: noopLogger)
    }

    func makeSUT(error: Error) -> SUT {
        WebPageEnricher(fetcher: StubHTTPFetcher(result: .failure(error)), logger: noopLogger)
    }
}

private struct StubError: Error {}

private struct StubHTTPFetcher: HTTPFetcher {
    let result: Result<HTTPFetchResponse, Error>

    func fetch(url: String, headers: [(String, String)], timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        try result.get()
    }
}

private actor SpyHTTPFetcher: HTTPFetcher {
    let result: Result<HTTPFetchResponse, Error>
    private(set) var capturedURL: String?

    init(result: Result<HTTPFetchResponse, Error>) {
        self.result = result
    }

    func fetch(url: String, headers: [(String, String)], timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        capturedURL = url
        return try result.get()
    }
}

private final class SpyLogHandler: LogHandler, @unchecked Sendable {

    struct Entry {
        let level: Logger.Level
        let message: String
        let metadata: Logger.Metadata?
    }

    private(set) var messages: [Entry] = []
    var metadata: Logger.Metadata = [:]
    var logLevel: Logger.Level = .trace

    subscript(metadataKey key: String) -> Logger.Metadata.Value? {
        get { metadata[key] }
        set { metadata[key] = newValue }
    }

    func log(level: Logger.Level, message: Logger.Message, metadata: Logger.Metadata?, source: String, file: String, function: String, line: UInt) {
        messages.append(Entry(level: level, message: "\(message)", metadata: metadata))
    }
}
