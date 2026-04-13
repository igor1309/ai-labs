@testable import NexumBackend
import Foundation
import XCTest

final class GitHubMetadataSourceTests: XCTestCase {

    override class func setUp() {
        URLProtocol.registerClass(URLProtocolMock.self)
    }

    override class func tearDown() {
        URLProtocol.unregisterClass(URLProtocolMock.self)
    }

    func test_fetch_shouldReturnMetadata_onSuccessfulResponse() async throws {
        URLProtocolMock.handler = { request in
            let data = Data("{\"name\":\"repo\",\"stargazers_count\":10,\"description\":\"desc\"}".utf8)
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, data)
        }
        let source = GitHubMetadataSource(githubToken: nil, session: makeURLSession())

        let metadata = try await source.fetch(url: "https://github.com/owner/repo")

        XCTAssertEqual(metadata, RepoMetadata(name: "repo", stars: 10, description: "desc"))
    }

    func test_fetch_shouldThrow_onFailureStatusCode() async {
        URLProtocolMock.handler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 500,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data())
        }
        let source = GitHubMetadataSource(githubToken: nil, session: makeURLSession())

        do {
            _ = try await source.fetch(url: "https://github.com/owner/repo")
            XCTFail("Expected fetch to fail")
        } catch {
            XCTAssertTrue(true)
        }
    }

    // MARK: - Helpers

    private func makeURLSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolMock.self]
        return URLSession(configuration: configuration)
    }
}

private final class URLProtocolMock: URLProtocol {

    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        _ = request
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = URLProtocolMock.handler else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "URLProtocolMock", code: 1))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
