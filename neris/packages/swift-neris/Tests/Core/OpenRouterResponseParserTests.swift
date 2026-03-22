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

    @Test func test_parse_shouldReturnText() throws {

        let content = makeSomeString()
        let sut = makeSUT()

        let result = try sut.parse(makeResponseData(content: content))

        #expect(result == .text(content))
    }

    @Test func test_parse_shouldReturnToolCall() throws {

        let (id, name, arguments) = (makeSomeString(), makeSomeString(), makeSomeString())
        let sut = makeSUT()

        let result = try sut.parse(makeToolCallData(id: id, name: name, arguments: arguments))

        #expect(result == .toolCalls([.init(id: id, name: name, arguments: arguments)]))
    }

    @Test func test_parse_shouldReturnMultipleToolCalls() throws {

        let (id1, name1, args1) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (id2, name2, args2) = (makeSomeString(), makeSomeString(), makeSomeString())
        let sut = makeSUT()
        let data = Data("""
        {"choices":[{"message":{"role":"assistant","tool_calls":[{"id":"\(id1)","type":"function","function":{"name":"\(name1)","arguments":"\(args1)"}},{"id":"\(id2)","type":"function","function":{"name":"\(name2)","arguments":"\(args2)"}}]}}]}
        """.utf8)

        let result = try sut.parse(data)

        #expect(result == .toolCalls([
            .init(id: id1, name: name1, arguments: args1),
            .init(id: id2, name: name2, arguments: args2),
        ]))
    }

    @Test func test_parse_shouldThrow_onMissingContent() {

        let sut = makeSUT()

        #expect(throws: SUT.InvalidResponseError.self) {
            _ = try sut.parse(makeValidJSON())
        }
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterResponseParser

    private func makeResponseData(content: String) -> Data {

        Data("""
        {"choices":[{"message":{"role":"assistant","content":"\(content)"}}]}
        """.utf8)
    }

    private func makeToolCallData(id: String = makeSomeString(), name: String, arguments: String = makeSomeString()) -> Data {

        Data("""
        {"choices":[{"message":{"role":"assistant","tool_calls":[{"id":"\(id)","type":"function","function":{"name":"\(name)","arguments":"\(arguments)"}}]}}]}
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

    struct ToolCallResponse: Equatable {
        let id: String
        let name: String
        let arguments: String
    }

    enum Response: Equatable {
        case text(String)
        case toolCalls([ToolCallResponse])
    }

    func parse(_ data: Data, _ response: HTTPURLResponse = makeSomeHTTPURLResponse()) throws -> Response {
        guard response.statusCode == 200 else { throw BadStatusCodeError(statusCode: response.statusCode) }
        guard let message = try? JSONDecoder().decode(Body.self, from: data).choices.first?.message
        else { throw InvalidResponseError() }
        if let toolCalls = message.toolCalls, !toolCalls.isEmpty {
            return .toolCalls(toolCalls.map { .init(id: $0.id, name: $0.function.name, arguments: $0.function.arguments) })
        }
        guard let content = message.content else { throw InvalidResponseError() }
        return .text(content)
    }

    struct InvalidResponseError: Error {}

    struct BadStatusCodeError: Error {
        let statusCode: Int
    }

    private struct Body: Decodable {
        let choices: [Choice]
    }

    private struct Choice: Decodable {
        let message: Message
    }

    private struct Message: Decodable {
        let content: String?
        let toolCalls: [ToolCall]?

        enum CodingKeys: String, CodingKey {
            case content
            case toolCalls = "tool_calls"
        }
    }

    private struct ToolCall: Decodable {
        let id: String
        let function: Function
    }

    private struct Function: Decodable {
        let name: String
        let arguments: String
    }
}
