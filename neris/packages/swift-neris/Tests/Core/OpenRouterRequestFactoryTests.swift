import Foundation
@testable import NerisCore
import Testing

final class OpenRouterRequestFactoryTests: TestContext {

    @Test func test_init_shouldNotCallConfig() {

        let (_, config) = makeSUT()

        #expect(config.callCount == 0)
    }

    @Test func test_make_shouldThrow_onEmptyMessages() {

        let (sut, _) = makeSUT()

        #expect(throws: SUT.EmptyMessagesError.self) {
            _ = try sut.make([Message]())
        }
    }

    @Test func test_make_shouldCallConfig_onOneMessage() throws {

        let (sut, config) = makeSUT()

        _ = try sut.make([makeMessage()])

        #expect(config.callCount == 1)
    }

    @Test func test_make_shouldCallConfig_onTwoMessages() throws {

        let (sut, config) = makeSUT()

        _ = try sut.make([makeMessage(), makeMessage()])

        #expect(config.callCount == 1)
    }

    @Test func test_make_shouldThrow_onConfigError() {

        let error = makeSomeError()
        let (sut, _) = makeSUT(configStubs: [.failure(error)])

        #expect {
            _ = try sut.make([makeMessage()])
        } throws: {
            ($0 as NSError) === (error as NSError)
        }
    }

    @Test func test_make_shouldSetURL() throws {

        let url = makeSomeURL()
        let (sut, _) = makeSUT(configStubs: [.success(makeConfig(url: url))])

        let request = try sut.make([makeMessage()])

        #expect(request.url == url)
    }

    @Test func test_make_shouldSetHTTPMethodToPost() throws {

        let request = try makeSUT().sut.make([makeMessage()])

        #expect(request.httpMethod == "POST")
    }

    @Test func test_make_shouldSetContentTypeHeader() throws {

        let request = try makeSUT().sut.make([makeMessage()])

        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    }

    @Test func test_make_shouldSetAuthorizationHeader() throws {

        let apiKey = makeSomeString()
        let (sut, _) = makeSUT(configStubs: [.success(makeConfig(apiKey: apiKey))])

        let request = try sut.make([makeMessage()])

        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(apiKey)")
    }

    @Test func test_make_shouldSetModelInBody() throws {

        let model = makeSomeString()
        let (sut, _) = makeSUT(configStubs: [.success(makeConfig(model: model))])

        let json = try makeBodyJSON(sut: sut)

        #expect(json["model"] as? String == model)
    }

    @Test func test_make_shouldOnlyContainModelAndMessagesInBody() throws {

        let json = try makeBodyJSON(sut: makeSUT().sut)

        #expect(Set(json.keys) == ["model", "messages"])
    }

    @Test func test_make_shouldSerializeUserMessageInBody() throws {

        let content = makeSomeString()

        try expectMessages([.user(content)], serializedAs: [["role": "user", "content": content]])
    }

    @Test func test_make_shouldSerializeAssistantMessageInBody() throws {

        let content = makeSomeString()

        try expectMessages([.assistant(content)], serializedAs: [["role": "assistant", "content": content]])
    }

    @Test func test_make_shouldSerializeAssistantToolCallMessageInBody() throws {

        let (id, name, arguments) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, _) = makeSUT()
        let toolCall = SUT.ToolCall(id: id, name: name, arguments: arguments)

        let json = try makeBodyJSON(sut: sut, messages: [.assistantToolCalls([toolCall])])
        let messages = json["messages"] as? [[String: Any]]
        let first = messages?.first
        let toolCalls = first?["tool_calls"] as? [[String: Any]]
        let function = toolCalls?.first?["function"] as? [String: String]

        #expect(first?["role"] as? String == "assistant")
        #expect(toolCalls?.first?["id"] as? String == id)
        #expect(toolCalls?.first?["type"] as? String == "function")
        #expect(function?["name"] == name)
        #expect(function?["arguments"] == arguments)
    }

    @Test func test_make_shouldSerializeSystemMessageInBody() throws {

        let content = makeSomeString()

        try expectMessages([.system(content)], serializedAs: [["role": "system", "content": content]])
    }

    @Test func test_make_shouldSerializeTwoMessagesInOrder() throws {

        let (first, second) = (makeSomeString(), makeSomeString())

        try expectMessages(
            [.user(first), .assistant(second)],
            serializedAs: [
                ["role": "user", "content": first],
                ["role": "assistant", "content": second],
            ]
        )
    }

    @Test func test_make_shouldSerializeToolMessageWithToolCallId() throws {

        let (toolCallId, content) = (makeSomeString(), makeSomeString())
        let (sut, _) = makeSUT()

        let json = try makeBodyJSON(sut: sut, messages: [.tool(toolCallId: toolCallId, content: content)])
        let messages = json["messages"] as? [[String: String]]

        #expect(messages == [["role": "tool", "tool_call_id": toolCallId, "content": content]])
    }

    // MARK: - Helpers

    private typealias SUT = OpenRouterRequestFactory
    private typealias Message = SUT.Message
    private typealias ConfigSpy = CallSpy<Void, Result<SUT.Config, Error>>

    private func makeSUT(
        configStubs: [Result<SUT.Config, Error>]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (sut: SUT, config: ConfigSpy) {

        let configStubs = configStubs ?? [.success(makeConfig())]
        let config = ConfigSpy(stubs: configStubs)
        let sut = SUT(config: { try config.call().get() })
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(config, sourceLocation: sourceLocation)
        return (sut, config)
    }

    private func makeConfig(
        apiKey: String = makeSomeString(),
        model: String = makeSomeString(),
        url: URL = makeSomeURL()
    ) -> SUT.Config {

        .init(apiKey: apiKey, model: model, url: url)
    }

    private func makeBodyJSON(
        sut: SUT,
        messages: [Message] = [.user(makeSomeString())],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) throws -> [String: Any] {

        let request = try sut.make(messages)
        let body = try #require(request.httpBody, sourceLocation: sourceLocation)
        return try #require(JSONSerialization.jsonObject(with: body) as? [String: Any], sourceLocation: sourceLocation)
    }

    private func expectMessages(
        _ messages: [Message],
        serializedAs expected: [[String: String]],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) throws {

        let (sut, _) = makeSUT()
        let json = try makeBodyJSON(sut: sut, messages: messages, sourceLocation)
        let actual = json["messages"] as? [[String: String]]
        #expect(actual == expected, sourceLocation: sourceLocation)
    }

    private func makeMessage() -> Message {

        .user(makeSomeString())
    }
}
