import Foundation

public protocol HTTPExecutor: Sendable {
    func execute(url: String, body: Data, timeout: TimeInterval) async throws -> Int
}

public protocol MessageSender: Sendable {
    func send(chatId: Int, text: String) async throws
}

public struct TelegramMessageSender: MessageSender, Sendable {

    private let botToken: String
    private let executor: any HTTPExecutor

    public init(botToken: String, executor: any HTTPExecutor) {
        self.botToken = botToken
        self.executor = executor
    }

    public func send(chatId: Int, text: String) async throws {
        let url = "https://api.telegram.org/bot\(botToken)/sendMessage"
        let payload: [String: Any] = ["chat_id": chatId, "text": text]
        let body = try JSONSerialization.data(withJSONObject: payload)
        let status = try await executor.execute(url: url, body: body, timeout: 5)
        guard (200..<300).contains(status) else {
            throw SendError.nonSuccess(status: status)
        }
    }

    public enum SendError: Error, Equatable {
        case nonSuccess(status: Int)
    }
}
