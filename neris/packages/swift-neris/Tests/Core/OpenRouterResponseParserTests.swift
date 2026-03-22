import Foundation
import Testing

final class OpenRouterResponseParserTests: TestContext {

    @Test func test_parse_shouldThrow_onInvalidJSON() {

        let sut = makeSUT()

        #expect(throws: (any Error).self) {
            try sut.parse(makeSomeData())
        }
    }

    @Test(arguments: [199, 201, 400, 401, 500])
    func test_parse_shouldThrow_onNon200StatusCode(statusCode: Int) {

        let sut = makeSUT()

        #expect(throws: (any Error).self) {
            try sut.parse(makeValidJSON(), makeSomeHTTPURLResponse(statusCode: statusCode))
        }
    }

    @Test func test_parse_shouldReturnContent() throws {

        let content = makeSomeString()
        let sut = makeSUT()

        let result = try sut.parse(makeResponseData(content: content))

        #expect(result == content)
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterResponseParser

    private func makeResponseData(content: String) -> Data {

        Data("""
        {"choices":[{"message":{"role":"assistant","content":"\(content)"}}]}
        """.utf8)
    }

    private func makeValidJSON() -> Data {

        Data("{}".utf8)
    }

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> SUT {

        let sut = SUT()
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        return sut
    }
}

private class OpenRouterResponseParser {

    func parse(_ data: Data, _ response: HTTPURLResponse = makeSomeHTTPURLResponse()) throws -> String {
        guard response.statusCode == 200 else { throw BadStatusCodeError(statusCode: response.statusCode) }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let choices = json?["choices"] as? [[String: Any]]
        let message = choices?.first?["message"] as? [String: Any]
        guard let content = message?["content"] as? String else { throw InvalidResponseError() }
        return content
    }

    struct InvalidResponseError: Error {}

    struct BadStatusCodeError: Error {
        let statusCode: Int
    }
}
