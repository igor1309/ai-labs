import Logging
import NIOCore
import Testing
@testable import NotioApp

@Suite("GitHubRepoEnricher")
struct GitHubRepoEnricherTests {
    @Test func test_shouldReturnFullNameAndDescription() async {
        let json = #"{"full_name":"apple/swift","description":"The Swift Programming Language"}"#
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: json))

        let result = await sut.enrich(url: "https://github.com/apple/swift", sourceType: .githubRepo)

        #expect(result.title == "apple/swift")
        #expect(result.description == "The Swift Programming Language")
        #expect(result.status == .full)
    }

    @Test func test_shouldReturnFailedOnAPIError() async {
        let sut = makeSUT(response: HTTPFetchResponse(status: 404, body: #"{"message":"Not Found"}"#))

        let result = await sut.enrich(url: "https://github.com/apple/nonexistent", sourceType: .githubRepo)

        #expect(result.title == nil)
        #expect(result.description == nil)
        #expect(result.status == .failed)
    }

    @Test func test_shouldReturnFailedOnFetchError() async {
        let sut = makeSUT(error: StubError())

        let result = await sut.enrich(url: "https://github.com/apple/swift", sourceType: .githubRepo)

        #expect(result.status == .failed)
    }

    @Test func test_shouldReturnPartialWhenDescriptionIsNull() async {
        let json = #"{"full_name":"apple/swift","description":null}"#
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: json))

        let result = await sut.enrich(url: "https://github.com/apple/swift", sourceType: .githubRepo)

        #expect(result.title == "apple/swift")
        #expect(result.description == nil)
        #expect(result.status == .partial)
    }

    @Test func test_shouldCallCorrectAPIURL() async {
        let spy = SpyHTTPFetcher(result: .success(HTTPFetchResponse(status: 200, body: #"{"full_name":"a/b"}"#)))
        let sut = GitHubRepoEnricher(fetcher: spy, logger: noopLogger)

        _ = await sut.enrich(url: "https://github.com/owner/repo", sourceType: .githubRepo)

        let captured = await spy.capturedURL
        #expect(captured == "https://api.github.com/repos/owner/repo")
    }

    @Test func test_shouldSendRequiredGitHubHeaders() async {
        let spy = SpyHTTPFetcher(result: .success(HTTPFetchResponse(status: 200, body: #"{"full_name":"a/b"}"#)))
        let sut = GitHubRepoEnricher(fetcher: spy, logger: noopLogger)

        _ = await sut.enrich(url: "https://github.com/owner/repo", sourceType: .githubRepo)

        let headers = await spy.capturedHeaders
        #expect(headers.map(\.0).contains("User-Agent"))
        #expect(headers.map(\.0).contains("Accept"))
    }

    @Test func test_shouldReturnFailedWhenFullNameMissing() async {
        let json = #"{"description":"Some repo"}"#
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: json))

        let result = await sut.enrich(url: "https://github.com/apple/swift", sourceType: .githubRepo)

        #expect(result.status == .failed)
        #expect(result.title == nil)
    }

    @Test func test_shouldReturnFailedForInvalidURL() async {
        let sut = makeSUT(response: HTTPFetchResponse(status: 200, body: "{}"))

        let result = await sut.enrich(url: "https://not-github.com/page", sourceType: .githubRepo)

        #expect(result.status == .failed)
    }

    @Test func test_shouldStripDotGitSuffixFromCloneURL() async {
        let spy = SpyHTTPFetcher(result: .success(HTTPFetchResponse(status: 200, body: #"{"full_name":"owner/repo"}"#)))
        let sut = GitHubRepoEnricher(fetcher: spy, logger: noopLogger)

        _ = await sut.enrich(url: "https://github.com/owner/repo.git", sourceType: .githubRepo)

        let captured = await spy.capturedURL
        #expect(captured == "https://api.github.com/repos/owner/repo")
    }
}

// MARK: - Helpers

private extension GitHubRepoEnricherTests {
    typealias SUT = GitHubRepoEnricher

    var noopLogger: Logger { Logger(label: "test", factory: SwiftLogNoOpLogHandler.init) }

    func makeSUT(response: HTTPFetchResponse) -> SUT {
        GitHubRepoEnricher(fetcher: StubHTTPFetcher(result: .success(response)), logger: noopLogger)
    }

    func makeSUT(error: Error) -> SUT {
        GitHubRepoEnricher(fetcher: StubHTTPFetcher(result: .failure(error)), logger: noopLogger)
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
    private(set) var capturedHeaders: [(String, String)] = []

    init(result: Result<HTTPFetchResponse, Error>) {
        self.result = result
    }

    func fetch(url: String, headers: [(String, String)], timeout: TimeAmount, maxBytes: Int) async throws -> HTTPFetchResponse {
        capturedURL = url
        capturedHeaders = headers
        return try result.get()
    }
}
