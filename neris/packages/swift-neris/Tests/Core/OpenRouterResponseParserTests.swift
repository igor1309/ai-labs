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

    // MARK: - Helpers

    private typealias SUT = OpenRouterResponseParser

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

    func parse(_ data: Data, _ response: HTTPURLResponse = makeSomeHTTPURLResponse()) throws {
        guard response.statusCode == 200 else { throw BadStatusCodeError(response.statusCode) }
        _ = try JSONSerialization.jsonObject(with: data)
    }

    struct BadStatusCodeError: Error {
        let statusCode: Int
        init(_ statusCode: Int) { self.statusCode = statusCode }
    }
}
