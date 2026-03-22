import Foundation
import Testing

final class OpenRouterResponseParserTests: TestContext {

    @Test func test_parse_shouldThrow_onInvalidJSON() {

        let sut = makeSUT()

        #expect(throws: SUT.InvalidResponseError.self) {
            _ = try sut.parse(makeSomeData(), makeSomeHTTPURLResponse())
        }
    }

    @Test(arguments: [199, 201, 400, 401, 500])
    func test_parse_shouldThrow_onNon200StatusCode(statusCode: Int) {

        let sut = makeSUT()

        #expect(throws: SUT.BadStatusCodeError.self) {
            _ = try sut.parse(makeValidJSON(), makeSomeHTTPURLResponse(statusCode: statusCode))
        }
    }

    @Test func test_parse_shouldReturnText() throws {

        let content = makeSomeString()
        let sut = makeSUT()

        let result = try sut.parse(makeTextResponseData(content: content), makeSomeHTTPURLResponse())

        #expect(result == .text(content))
    }

    @Test func test_parse_shouldReturnToolCall() throws {

        let toolCall = makeToolCall()
        let sut = makeSUT()

        let result = try sut.parse(makeToolCallData(toolCall), makeSomeHTTPURLResponse())

        #expect(result == .toolCalls([toolCall]))
    }

    @Test func test_parse_shouldReturnMultipleToolCalls() throws {

        let (first, second) = (makeToolCall(), makeToolCall())
        let sut = makeSUT()

        let result = try sut.parse(makeToolCallData(first, second), makeSomeHTTPURLResponse())

        #expect(result == .toolCalls([first, second]))
    }

    @Test func test_parse_shouldThrow_onMissingContent() {

        let sut = makeSUT()

        #expect(throws: SUT.InvalidResponseError.self) {
            _ = try sut.parse(makeValidJSON(), makeSomeHTTPURLResponse())
        }
    }

    @Test func test_parse_shouldThrow_onEmptyChoices() {

        let sut = makeSUT()

        #expect(throws: SUT.InvalidResponseError.self) {
            _ = try sut.parse(makeJSON(["choices": []]), makeSomeHTTPURLResponse())
        }
    }

    @Test func test_parse_shouldReturnText_onLengthFinishReason() throws {

        let content = makeSomeString()
        let sut = makeSUT()

        let result = try sut.parse(makeFinishReasonData("length", content: content), makeSomeHTTPURLResponse())

        #expect(result == .text(content))
    }

    @Test func test_parse_shouldThrow_onErrorFinishReason() {

        let sut = makeSUT()

        #expect(throws: SUT.ServerError.self) {
            _ = try sut.parse(makeFinishReasonData("error"), makeSomeHTTPURLResponse())
        }
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterResponseParser

    private func makeTextResponseData(content: String) -> Data {

        makeJSON([
            "choices": [[
                "index": 0,
                "finish_reason": "stop",
                "message": ["role": "assistant", "content": content],
            ]],
        ])
    }

    private func makeToolCallData(_ toolCalls: SUT.ToolCallResponse...) -> Data {

        makeJSON([
            "choices": [[
                "index": 0,
                "finish_reason": "tool_calls",
                "message": [
                    "role": "assistant",
                    "tool_calls": toolCalls.map {
                        [
                            "id": $0.id,
                            "type": "function",
                            "function": ["name": $0.name, "arguments": $0.arguments],
                        ] as [String: Any]
                    },
                ] as [String: Any],
            ] as [String: Any]],
        ])
    }

    private func makeJSON(_ object: [String: Any]) -> Data {

        try! JSONSerialization.data(withJSONObject: object)
    }

    private func makeValidJSON() -> Data {

        makeJSON([:])
    }

    private func makeFinishReasonData(_ finishReason: String, content: String = makeSomeString()) -> Data {

        makeJSON([
            "choices": [[
                "index": 0,
                "finish_reason": finishReason,
                "message": ["role": "assistant", "content": content],
            ] as [String: Any]],
        ])
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

    func parse(_ data: Data, _ response: HTTPURLResponse) throws -> Response {
        guard response.statusCode == 200 else { throw BadStatusCodeError(statusCode: response.statusCode) }
        guard let choice = try? JSONDecoder().decode(Body.self, from: data).choices.first
        else { throw InvalidResponseError() }
        switch choice.finishReason {
        case "tool_calls":
            guard let toolCalls = choice.message.toolCalls, !toolCalls.isEmpty else { throw InvalidResponseError() }
            return .toolCalls(toolCalls.map { .init(id: $0.id, name: $0.function.name, arguments: $0.function.arguments) })
        case "error":
            throw ServerError()
        default:
            guard let content = choice.message.content else { throw InvalidResponseError() }
            return .text(content)
        }
    }

    struct InvalidResponseError: Error {}
    struct ServerError: Error {}

    struct BadStatusCodeError: Error {
        let statusCode: Int
    }

    private struct Body: Decodable {
        let choices: [Choice]
    }

    private struct Choice: Decodable {
        let message: Message
        let finishReason: String

        enum CodingKeys: String, CodingKey {
            case message
            case finishReason = "finish_reason"
        }
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
