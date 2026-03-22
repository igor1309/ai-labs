import Foundation
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

        let (sut, _) = makeSUT(configStubs: [.failure(makeSomeError())])

        #expect(throws: (any Error).self) {
            _ = try sut.make([makeMessage()])
        }
    }

    @Test func test_make_shouldSetURL() throws {

        let url = makeSomeURL()
        let (sut, _) = makeSUT(configStubs: [.success(makeConfig(url: url))])

        let request = try sut.make([makeMessage()])

        #expect(request.url == url)
    }

    @Test func test_make_shouldSetHTTPMethodToPost() throws {

        let (sut, _) = makeSUT()

        let request = try sut.make([makeMessage()])

        #expect(request.httpMethod == "POST")
    }

    @Test func test_make_shouldSetContentTypeHeader() throws {

        let (sut, _) = makeSUT()

        let request = try sut.make([makeMessage()])

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

    // MARK: - Helpers

    private typealias SUT = OpenRouterRequestFactory
    private typealias Message = String
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
        messages: [Message] = [makeSomeString()],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) throws -> [String: Any] {

        let request = try sut.make(messages)
        let body = try #require(request.httpBody, sourceLocation: sourceLocation)
        return try #require(JSONSerialization.jsonObject(with: body) as? [String: Any], sourceLocation: sourceLocation)
    }

    private func makeMessage() -> Message {

        makeSomeString()
    }
}

private class OpenRouterRequestFactory {

    struct Config {
        let apiKey: String
        let model: String
        let url: URL
    }

    typealias ConfigProvider = () throws -> Config

    private let config: ConfigProvider

    init(config: @escaping ConfigProvider) {

        self.config = config
    }

    func make(_ messages: [String]) throws -> URLRequest {

        guard !messages.isEmpty else { throw EmptyMessagesError() }
        let config = try config()
        var request = URLRequest(url: config.url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["model": config.model])
        return request
    }

    struct EmptyMessagesError: Error {}
}
