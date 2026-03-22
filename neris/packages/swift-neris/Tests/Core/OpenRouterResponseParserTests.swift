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

        let toolCall = makeToolCall()
        let sut = makeSUT()

        let result = try sut.parse(makeToolCallData(toolCall))

        #expect(result == .toolCalls([toolCall]))
    }

    @Test func test_parse_shouldReturnMultipleToolCalls() throws {

        let (first, second) = (makeToolCall(), makeToolCall())
        let sut = makeSUT()

        let result = try sut.parse(makeToolCallData(first, second))

        #expect(result == .toolCalls([first, second]))
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

    private func makeToolCallData(_ toolCalls: SUT.ToolCallResponse...) -> Data {

        let serialized = toolCalls.map {
            """
            {"id":"\($0.id)","type":"function","function":{"name":"\($0.name)","arguments":"\($0.arguments)"}}
            """
        }.joined(separator: ",")
        return Data("""
        {"choices":[{"message":{"role":"assistant","tool_calls":[\(serialized)]}}]}
        """.utf8)
    }

    private func makeValidJSON() -> Data {

        Data("{}".utf8)
    }

    private func makeToolCall() -> SUT.ToolCallResponse {

        .init(id: makeSomeString(), name: makeSomeString(), arguments: makeSomeString())
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
