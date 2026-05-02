import Foundation
import Testing
@testable import NotioApp

@Suite("TelegramMessageSender")
struct TelegramMessageSenderTests {
    @Test func test_init_shouldExposePublicBotTokenInitializer() {
        _ = TelegramMessageSender(botToken: "t")
    }

    @Test func test_send_shouldPassFiveSecondTimeout() async throws {
        let spy = SpyHTTPExecutor()
        let sut = makeSUT(botToken: "t", executor: spy)

        try await sut.send(chatId: 1, text: "x")

        let request = try #require(await spy.requests.first)
        #expect(request.timeout == 5)
    }

    @Test func test_send_shouldThrowOnNon2xx() async throws {
        let spy = SpyHTTPExecutor()
        await spy.setStatusCode(403)
        let sut = makeSUT(botToken: "t", executor: spy)

        await #expect(throws: TelegramMessageSender.SendError.nonSuccess(status: 403)) {
            try await sut.send(chatId: 1, text: "x")
        }
    }

    @Test func test_send_shouldProduceCorrectURLAndBody() async throws {
        let spy = SpyHTTPExecutor()
        let sut = makeSUT(botToken: "bot-token-123", executor: spy)

        try await sut.send(chatId: 42, text: "hello")

        let request = try #require(await spy.requests.first)
        #expect(request.url == "https://api.telegram.org/botbot-token-123/sendMessage")
        let body = try #require(request.body)
        let json = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(json?["chat_id"] as? Int == 42)
        #expect(json?["text"] as? String == "hello")
    }
}

// MARK: - Helpers

private extension TelegramMessageSenderTests {
    typealias SUT = TelegramMessageSender

    func makeSUT(botToken: String, executor: SpyHTTPExecutor) -> SUT {
        TelegramMessageSender(botToken: botToken, executor: executor)
    }
}

actor SpyHTTPExecutor: HTTPExecutor {
    struct RecordedRequest {
        let url: String
        let body: Data?
        let timeout: TimeInterval
    }

    private(set) var requests: [RecordedRequest] = []
    private(set) var statusCode: Int = 200

    func setStatusCode(_ code: Int) {
        statusCode = code
    }

    func execute(url: String, body: Data, timeout: TimeInterval) async throws -> Int {
        requests.append(RecordedRequest(url: url, body: body, timeout: timeout))
        return statusCode
    }
}
