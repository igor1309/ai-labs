import Foundation
import Logging
import Testing
@testable import NotioApp

@Suite("CaptureFeedbackMessenger")
struct CaptureFeedbackMessengerTests {
    @Test func test_send_shouldMapReceiptToCorrectText() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)

        await sut.send(chatId: 1, feedback: .receipt)

        let messages = await spy.messages
        #expect(messages.map(\.text) == ["Received. Processing..."])
    }

    @Test func test_send_shouldMapSuccessNoteToCorrectText() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)
        let item = makeItem(kind: .note)

        await sut.send(chatId: 1, feedback: .success(item))

        let messages = await spy.messages
        #expect(messages.map(\.text) == ["Saved note."])
    }

    @Test func test_send_shouldMapSuccessLinkWithTitleToCorrectText() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)
        let item = makeItem(kind: .link, url: "https://example.com", capturedTitle: "Example")

        await sut.send(chatId: 1, feedback: .success(item))

        let messages = await spy.messages
        #expect(messages.map(\.text) == ["Saved: Example"])
    }

    @Test func test_send_shouldTruncateAndNormalizeLinkTitle_onLongOrMultilineTitle() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)
        let longTitle = "  \(String(repeating: "x", count: 40))\n\(String(repeating: "y", count: 40))  "
        let item = makeItem(
            kind: .link,
            url: "https://example.com",
            capturedTitle: longTitle
        )

        await sut.send(chatId: 1, feedback: .success(item))

        let messages = await spy.messages
        #expect(messages.map(\.text) == ["Saved: \(String(repeating: "x", count: 40)) \(String(repeating: "y", count: 28))..."])
    }

    @Test func test_send_shouldMapSuccessLinkWithoutTitleToCorrectText() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)
        let item = makeItem(kind: .link, url: "https://example.com")

        await sut.send(chatId: 1, feedback: .success(item))

        let messages = await spy.messages
        #expect(messages.map(\.text) == ["Saved link."])
    }

    @Test func test_send_shouldMapFailureToCorrectText() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)

        await sut.send(chatId: 1, feedback: .failure)

        let messages = await spy.messages
        #expect(messages.map(\.text) == ["Failed to save. Try again later."])
    }

    @Test func test_send_shouldPassChatIdToSender() async {
        let spy = SpyMessageSender()
        let sut = makeSUT(sender: spy)

        await sut.send(chatId: 42, feedback: .receipt)

        let messages = await spy.messages
        #expect(messages.map(\.chatId) == [42])
    }

    @Test func test_send_shouldSwallowDeliveryError() async {
        let spy = SpyMessageSender()
        await spy.setShouldThrow(true)
        let sut = makeSUT(sender: spy)

        await sut.send(chatId: 1, feedback: .receipt)

        let messages = await spy.messages
        #expect(messages.count == 1)
    }

    @Test func test_send_shouldLogSanitizedFeedbackOnDeliveryFailure() async {
        let spy = SpyMessageSender()
        await spy.setShouldThrow(true)
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let sut = TelegramCaptureFeedbackMessenger(sender: spy, logger: logger)
        let item = makeItem(kind: .note)

        await sut.send(chatId: 1, feedback: .success(item))

        let warning = handler.events.first(where: { $0.level == .warning })
        let feedbackValue = warning?.metadata?["feedback"]?.description
        #expect(feedbackValue == "success_note")
    }
}

// MARK: - Helpers

private extension CaptureFeedbackMessengerTests {
    typealias SUT = TelegramCaptureFeedbackMessenger

    func makeSUT(sender: SpyMessageSender) -> SUT {
        TelegramCaptureFeedbackMessenger(
            sender: sender,
            logger: Logger(label: "test", factory: SwiftLogNoOpLogHandler.init)
        )
    }

    func makeItem(
        kind: CapturedItem.Kind,
        url: String? = nil,
        capturedTitle: String? = nil
    ) -> CapturedItem {

        CapturedItem(
            kind: kind,
            sourceType: url != nil ? .webPage : nil,
            capturedAt: Date(),
            url: url,
            note: kind == .note ? "note text" : nil,
            enrichment: .none,
            capturedTitle: capturedTitle,
            capturedDescription: nil
        )
    }
}

actor SpyMessageSender: MessageSender {
    struct Message {
        let chatId: Int
        let text: String
    }

    private(set) var messages: [Message] = []
    private var shouldThrow = false

    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }

    func send(chatId: Int, text: String) async throws {
        messages.append(Message(chatId: chatId, text: text))
        if shouldThrow {
            throw SendError()
        }
    }

    struct SendError: Error {}
}
