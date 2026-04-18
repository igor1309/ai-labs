import Foundation
import Testing
@testable import NotioApp

@Suite("TelegramUpdate")
struct TelegramUpdateTests {
    @Test func test_decode_shouldParseUpdateId() throws {
        let json = #"{"update_id":42,"message":{"message_id":1,"chat":{"id":123},"date":0,"text":"hello"}}"#
        let update = try JSONDecoder().decode(TelegramUpdate.self, from: Data(json.utf8))
        #expect(update.updateId == 42)
    }

    @Test func test_decode_shouldParseMessageText() throws {
        let json = #"{"update_id":1,"message":{"message_id":1,"chat":{"id":123},"date":0,"text":"hello world"}}"#
        let update = try JSONDecoder().decode(TelegramUpdate.self, from: Data(json.utf8))
        #expect(update.message?.text == "hello world")
    }

    @Test func test_decode_shouldParseChatId() throws {
        let json = #"{"update_id":1,"message":{"message_id":1,"chat":{"id":456},"date":0,"text":"hi"}}"#
        let update = try JSONDecoder().decode(TelegramUpdate.self, from: Data(json.utf8))
        #expect(update.message?.chat.id == 456)
    }

    @Test func test_decode_shouldHandleMissingMessage() throws {
        let json = #"{"update_id":1}"#
        let update = try JSONDecoder().decode(TelegramUpdate.self, from: Data(json.utf8))
        #expect(update.message == nil)
    }

    @Test func test_decode_shouldHandleMissingText() throws {
        let json = #"{"update_id":1,"message":{"message_id":1,"chat":{"id":1},"date":0}}"#
        let update = try JSONDecoder().decode(TelegramUpdate.self, from: Data(json.utf8))
        #expect(update.message?.text == nil)
    }

    @Test func test_decode_shouldParseEntities() throws {
        let json = #"{"update_id":1,"message":{"message_id":1,"chat":{"id":1},"date":0,"text":"visit https://example.com","entities":[{"type":"url","offset":6,"length":19}]}}"#
        let update = try JSONDecoder().decode(TelegramUpdate.self, from: Data(json.utf8))
        let entity = try #require(update.message?.entities?.first)
        #expect(entity.type == "url")
        #expect(entity.offset == 6)
        #expect(entity.length == 19)
    }
}
