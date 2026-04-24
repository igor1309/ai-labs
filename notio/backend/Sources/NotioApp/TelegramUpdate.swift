import Foundation

public struct TelegramUpdate: Decodable, Sendable {

    public let updateId: Int
    public let message: Message?

    public struct Message: Decodable, Sendable {

        public let messageId: Int
        public let chat: Chat
        public let date: Int
        public let text: String?
        public let entities: [Entity]?
    }

    public struct Chat: Decodable, Sendable {

        public let id: Int
    }

    public struct Entity: Decodable, Sendable {

        public let type: String
        public let offset: Int
        public let length: Int
    }

    enum CodingKeys: String, CodingKey {
        case updateId = "update_id"
        case message
    }
}

extension TelegramUpdate.Message {
    enum CodingKeys: String, CodingKey {
        case messageId = "message_id"
        case chat, date, text, entities
    }
}
