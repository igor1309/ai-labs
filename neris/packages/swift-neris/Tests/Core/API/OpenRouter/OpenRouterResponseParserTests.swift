import Foundation
@testable import NerisCore
import Testing

final class OpenRouterResponseParserTests: TestContext {

    @Test func test_parse_shouldThrow_onInvalidJSON() {

        let sut = makeSUT()

        #expect(throws: SUT.InvalidResponseError.self) {
            _ = try sut.parse(makeSomeData(), makeSomeHTTPURLResponse())
        }
    }

    @Test func test_parse_shouldThrow_onNonHTTPResponse() {

        let sut = makeSUT()

        #expect(throws: SUT.InvalidResponseError.self) {
            _ = try sut.parse(makeValidJSON(), URLResponse())
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
